import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatMoney, parseUrgentDelivery, urgentFee, type CheckoutPaymentMethod, type UrgentDelivery } from '@talad/shared';
import { randomInt } from 'node:crypto';
import type { Env } from '../../config/env.validation.js';
import { Prisma, type OrderStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CmsService } from '../cms/cms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CartService, groupByShop, type CartLine, type VirtualItem } from '../cart/cart.service.js';
import {
  allocateDiscount,
  couponDiscount,
  couponProblem,
  itemCommissions,
  normalizeCouponCode,
  type CouponErrorCode,
  type CouponRule,
} from './checkout-pricing.js';
import { paymentOf, slipPrefix } from './payment-slips.service.js';

const DEFAULT_COMMISSION_RATE = 5;

export interface QuoteIssue {
  itemId: string;
  code: 'UNAVAILABLE' | 'QUANTITY_EXCEEDS_STOCK' | 'OWN_PRODUCT';
}

/** Where a customer sends a manual transfer for one shop. */
export interface ShopTransferInfo {
  bankCode: string | null;
  accountName: string | null;
  accountNumber: string | null;
  hasQr: boolean;
}

/**
 * Courier the customer can pick. No courier has an API yet, so there is no price:
 * the delivery fee is paid to the courier, outside Taladonline.
 */
export interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
}

/** What the customer has chosen so far; everything but the items is optional for a quote. */
export interface CheckoutSelection {
  itemIds: string[];
  /** Instead of cart lines: items of an order card in a chat (the cart isn't touched). */
  items?: VirtualItem[];
  deliveryProviderId?: string;
  couponCode?: string;
  /** Decides which couriers serve the province; defaults to the customer's default address. */
  addressId?: string;
  /** Shops whose own urgent delivery the customer chose (when they offer it to the address). */
  urgentShopIds?: string[];
}

export interface PlaceOrderInput extends CheckoutSelection {
  addressId: string;
  paymentMethod: CheckoutPaymentMethod;
  expectedTotal: number;
  /** Transfer slip storage key per shop id (required for BANK_TRANSFER). */
  slips?: Record<string, string>;
  note?: string;
}

const yymmdd = (d: Date) => d.toISOString().slice(2, 10).replaceAll('-', '');
const orderNumber = (d: Date) => `TL${yymmdd(d)}${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;

/** Checkout (§4.4): prices come from the catalog at the moment of ordering, never the client. */
@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart: CartService,
    private readonly config: ConfigService<Env, true>,
    private readonly cms: CmsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Totals for the selected cart lines, split per shop: coupon discount and each shop's
   * transfer details. Delivery isn't priced (paid to the courier). An unusable coupon is
   * reported in `couponError`, not thrown.
   */
  async quote(customerId: string, selection: CheckoutSelection) {
    return (await this.price(customerId, selection)).quote;
  }

  private async price(customerId: string, selection: CheckoutSelection) {
    const lines = await this.linesFor(customerId, selection);
    const issues: QuoteIssue[] = [];
    for (const l of lines) {
      if (l.ownShop) issues.push({ itemId: l.id, code: 'OWN_PRODUCT' });
      else if (!l.available) issues.push({ itemId: l.id, code: 'UNAVAILABLE' });
      else if (l.quantity > l.stock) issues.push({ itemId: l.id, code: 'QUANTITY_EXCEEDS_STOCK' });
    }

    const groups = groupByShop(lines);
    const [transfer, cod, urgentSettings, address, options] = await Promise.all([
      this.transferInfo(groups.map((g) => g.shop.id)),
      this.codShops(groups.map((g) => g.shop.id)),
      this.urgentSettings(groups.map((g) => g.shop.id)),
      this.address(customerId, selection.addressId),
      this.deliveryOptions(customerId, selection.addressId),
    ]);
    const wantsUrgent = new Set(selection.urgentShopIds ?? []);
    // Unknown or missing choice falls back to the first courier.
    const courier = options.find((o) => o.id === selection.deliveryProviderId) ?? options[0] ?? null;

    const { coupon, couponError, discounts } = await this.applyCoupon(customerId, selection.couponCode, groups);
    const shops = groups.map((g) => {
      const discount = discounts.get(g.shop.id) ?? 0;
      // The shop's own urgent delivery, when it covers the address (its fee joins the total).
      const settings = urgentSettings.get(g.shop.id);
      const fee = address ? urgentFee(settings, address) : null;
      const urgent = fee !== null ? { fee, eta: settings!.eta } : null;
      const urgentSelected = urgent !== null && wantsUrgent.has(g.shop.id);
      const shippingFee = urgentSelected ? urgent.fee : 0;
      return {
        ...g,
        discount,
        urgent,
        urgentSelected,
        shippingFee,
        total: g.subtotal - discount + shippingFee,
        transfer: transfer.get(g.shop.id) ?? null,
        /** The shop offers cash on delivery (its own choice, §6). */
        cod: cod.has(g.shop.id),
      };
    });
    const subtotal = shops.reduce((n, s) => n + s.subtotal, 0);
    const discountTotal = shops.reduce((n, s) => n + s.discount, 0);
    const shippingTotal = shops.reduce((n, s) => n + s.shippingFee, 0);
    return {
      couponRule: coupon,
      quote: {
        shops,
        subtotal,
        discountTotal,
        shippingTotal,
        total: subtotal - discountTotal + shippingTotal,
        issues,
        delivery: { options, selectedId: courier?.id ?? null },
        coupon: coupon ? { code: coupon.code, shopId: coupon.shopId, discount: discountTotal } : null,
        couponError,
        // QR transfer needs every shop in the order to accept transfers.
        transferAvailable: shops.every((s) => s.transfer !== null),
        // Likewise COD: every shop in the order must have turned it on.
        codAvailable: shops.length > 0 && shops.every((s) => s.cod),
        /** Payment methods the platform currently accepts. */
        paymentMethods: (await this.cms.publicSettings()).paymentMethods,
      },
    };
  }

  async place(customerId: string, input: PlaceOrderInput) {
    const { quote, couponRule } = await this.price(customerId, input);
    // Admins choose which methods checkout offers (§2.8).
    if (!quote.paymentMethods.includes(input.paymentMethod)) {
      throw new BadRequestException({ code: 'PAYMENT_METHOD_DISABLED', message: 'This payment method is not available' });
    }
    if (quote.delivery.options.length > 0 && quote.delivery.selectedId !== input.deliveryProviderId) {
      throw new BadRequestException({ code: 'DELIVERY_REQUIRED', message: 'Choose a delivery service' });
    }
    if (input.couponCode && quote.couponError) {
      throw new BadRequestException({ code: quote.couponError, message: 'This coupon cannot be used' });
    }
    if (quote.issues.length) {
      throw new ConflictException({ code: 'CART_CHANGED', message: 'Some items are no longer available', issues: quote.issues });
    }
    // The customer must pay exactly what they were shown.
    if (quote.total !== input.expectedTotal) {
      throw new ConflictException({ code: 'PRICE_CHANGED', message: 'Prices changed, please review your order' });
    }

    if (input.paymentMethod === 'COD' && !quote.codAvailable) {
      throw new BadRequestException({ code: 'COD_UNAVAILABLE', message: 'A shop in this order does not offer cash on delivery' });
    }
    const isTransfer = input.paymentMethod === 'BANK_TRANSFER';
    if (isTransfer) {
      if (!quote.transferAvailable) {
        throw new BadRequestException({ code: 'TRANSFER_UNAVAILABLE', message: 'A shop in this order does not accept transfers' });
      }
      // Manual payment: a slip for every shop must be attached before ordering.
      const missing = quote.shops.filter((s) => !input.slips?.[s.shop.id]?.startsWith(slipPrefix(customerId)));
      if (missing.length) {
        throw new BadRequestException({
          code: 'SLIP_REQUIRED',
          message: 'Attach a payment slip for every shop',
          shopIds: missing.map((s) => s.shop.id),
        });
      }
    }

    const address = await this.prisma.address.findFirst({ where: { id: input.addressId, customerId } });
    if (!address) throw new BadRequestException({ code: 'ADDRESS_REQUIRED', message: 'Choose a delivery address' });

    const lines = await this.linesFor(customerId, input);
    const defaultRate = await this.defaultCommissionRate();
    const now = new Date();
    // COD needs no payment step. A transfer waits in "to pay" until the shop checks the slip.
    const status: OrderStatus = isTransfer ? 'PENDING' : 'CONFIRMED';
    const note = input.note?.trim() || null;
    const shippingAddress = {
      recipientName: address.recipientName,
      phone: address.phone,
      province: address.province,
      district: address.district,
      village: address.village,
      line: address.line,
    };

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Reserve stock; a concurrent order that took the last units makes this fail.
          for (const l of lines) {
            const updated = l.variantId
              ? await tx.productVariant.updateMany({
                  where: { id: l.variantId, stock: { gte: l.quantity } },
                  data: { stock: { decrement: l.quantity } },
                })
              : await tx.product.updateMany({
                  where: { id: l.productId, stock: { gte: l.quantity } },
                  data: { stock: { decrement: l.quantity } },
                });
            if (updated.count === 0) {
              throw new ConflictException({
                code: 'CART_CHANGED',
                message: 'Some items just sold out',
                issues: [{ itemId: l.id, code: 'QUANTITY_EXCEEDS_STOCK' }],
              });
            }
          }

          if (couponRule) await this.redeemCoupon(tx, couponRule, customerId);

          const number = orderNumber(now);
          const order = await tx.order.create({
            data: {
              number: `O${number}`,
              customerId,
              shippingAddress,
              subtotal: quote.subtotal,
              discountTotal: quote.discountTotal,
              shippingTotal: quote.shippingTotal,
              grandTotal: quote.total,
              note,
            },
          });
          if (couponRule) {
            await tx.couponRedemption.create({
              data: { couponId: couponRule.id, customerId, orderId: order.id, amount: quote.discountTotal },
            });
          }

          const shopOrders: string[] = [];
          for (const [i, group] of quote.shops.entries()) {
            const groupLines = lines.filter((l) => l.shop.id === group.shop.id);
            // A shop coupon is the shop's own discount; a platform coupon is funded by Taladonline.
            const shopDiscount = couponRule?.shopId ? group.discount : 0;
            const platformDiscount = couponRule && !couponRule.shopId ? group.discount : 0;
            const rates = new Map(groupLines.map((l) => [l.id, l.internal.commissionRate ?? defaultRate]));
            const fees = itemCommissions(groupLines.map((l) => ({ id: l.id, lineTotal: l.lineTotal, rate: rates.get(l.id)! })), shopDiscount);
            const shopNumber = quote.shops.length > 1 ? `${number}-${i + 1}` : number;
            const slipKey = isTransfer ? input.slips![group.shop.id] : null;
            await tx.shopOrder.create({
              data: {
                number: shopNumber,
                order: { connect: { id: order.id } },
                shop: { connect: { id: group.shop.id } },
                status,
                // Unpaid orders are cancelled when the shop's payment window ends (OrderDeadlinesService).
                paymentDueAt: status === 'PENDING' ? new Date(now.getTime() + groupLines[0].internal.paymentWindowHrs * 3_600_000) : null,
                subtotal: group.subtotal,
                discountTotal: group.discount,
                platformDiscount,
                // Each item at its own rate (shop override, else its category, else the default).
                commissionAmount: [...fees.values()].reduce((n, f) => n + f, 0),
                total: group.total,
                shippingFee: group.shippingFee,
                urgentDelivery: group.urgentSelected,
                // Urgent delivery is the shop's own; other shops go with the chosen courier.
                ...(!group.urgentSelected && quote.delivery.selectedId && { deliveryProvider: { connect: { id: quote.delivery.selectedId } } }),
                items: {
                  create: groupLines.map((l) => ({
                    productId: l.productId,
                    variantId: l.variantId,
                    name: l.name,
                    sku: l.sku,
                    unitPrice: l.unitPrice,
                    regularPrice: l.regularPrice,
                    quantity: l.quantity,
                    lineTotal: l.lineTotal,
                    commissionRate: rates.get(l.id)!,
                    commissionAmount: fees.get(l.id)!,
                  })),
                },
                // Each shop is paid separately (its own QR / its own courier collecting COD).
                payments: {
                  create: {
                    order: { connect: { id: order.id } },
                    method: input.paymentMethod,
                    status: 'PENDING',
                    amount: group.total,
                    slipKey,
                    slipUploadedAt: slipKey ? now : null,
                  },
                },
                history: {
                  create: [
                    {
                      toStatus: 'PENDING',
                      actorType: 'CUSTOMER',
                      actorId: customerId,
                      note: isTransfer ? 'Payment slip submitted' : null,
                      createdAt: now,
                    },
                    ...(isTransfer
                      ? []
                      : [{ fromStatus: 'PENDING' as const, toStatus: 'CONFIRMED' as const, note: 'Cash on delivery', createdAt: now }]),
                  ],
                },
              },
            });
            shopOrders.push(shopNumber);
            // The shop hears about it right away (live in the Seller Center, with a sound).
            const units = groupLines.reduce((n, l) => n + l.quantity, 0);
            const pay = isTransfer ? { lo: 'ກວດສະລິບການໂອນ', en: 'transfer slip to check' } : { lo: 'ຈ່າຍປາຍທາງ', en: 'cash on delivery' };
            await this.notifications.toShop(
              tx,
              group.shop.id,
              'ORDER',
              {
                lo: { title: `ມີຄຳສັ່ງຊື້ໃໝ່ ${shopNumber}`, body: `${units} ລາຍການ · ${formatMoney(group.total, 'lo')} · ${pay.lo}` },
                en: { title: `New order ${shopNumber}`, body: `${units} item${units === 1 ? '' : 's'} · ${formatMoney(group.total, 'en')} · ${pay.en}` },
              },
              { link: `/orders/${shopNumber}` },
            );
          }

          if (!input.items) await tx.cartItem.deleteMany({ where: { customerId, id: { in: lines.map((l) => l.id) } } });
          return { orderNumber: order.number, shopOrders, total: quote.total, paymentMethod: input.paymentMethod };
        });
      } catch (e) {
        // Order numbers are random; retry the rare collision.
        const collision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!collision || attempt >= 3) throw e;
      }
    }
  }

  /**
   * Development only: confirm an order's payment, standing in for the shop checking
   * the slip (and, later, payment gateway callbacks).
   */
  async simulatePayment(customerId: string, shopOrderNumber: string) {
    if (this.config.get('NODE_ENV', { infer: true }) === 'production') throw new ForbiddenException();
    const shopOrder = await this.prisma.shopOrder.findFirst({
      where: { number: shopOrderNumber, order: { customerId } },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        shop: { select: { paymentQrKey: true } },
        order: {
          select: {
            shopOrders: { select: { id: true, status: true } },
            payments: { where: { shopOrderId: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });
    if (!shopOrder) throw new NotFoundException('Order not found');
    const payment = paymentOf(shopOrder);
    if (!payment || payment.status !== 'PENDING' || payment.method === 'COD') {
      throw new BadRequestException({ code: 'NOT_PAYABLE', message: 'This order has nothing to pay' });
    }

    // A per-shop payment confirms that shop order; a legacy order-level one confirms all.
    const covered = payment.shopOrderId
      ? [shopOrder]
      : shopOrder.order.shopOrders;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', paidAt: now, providerRef: `SIM-${Date.now()}` },
      }),
      ...covered
        .filter((so) => so.status === 'PENDING')
        .flatMap((so) => [
          this.prisma.shopOrder.update({ where: { id: so.id }, data: { status: 'CONFIRMED' } }),
          this.prisma.orderStatusHistory.create({
            data: { shopOrderId: so.id, fromStatus: 'PENDING', toStatus: 'CONFIRMED', note: 'Payment confirmed', createdAt: now },
          }),
        ]),
    ]);
    return { ok: true };
  }

  /** Active couriers that deliver to the address's province. */
  private async deliveryOptions(customerId: string, addressId?: string): Promise<DeliveryOption[]> {
    const [address, providers] = await Promise.all([
      this.prisma.address.findFirst({
        where: addressId ? { id: addressId, customerId } : { customerId },
        orderBy: { isDefault: 'desc' },
        select: { province: true },
      }),
      this.prisma.deliveryProvider.findMany({
        where: { isActive: true },
        include: { zones: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    const province = address?.province;
    return providers.flatMap((p) => {
      // A zone listing the province wins over a nationwide zone (no provinces).
      const zone =
        (province ? p.zones.find((z) => z.provinces.includes(province)) : undefined) ??
        p.zones.find((z) => z.provinces.length === 0);
      return zone ? [{ id: p.id, code: p.code, name: p.name, logoUrl: p.logoUrl }] : [];
    });
  }

  /**
   * Finds the coupon for `code` among platform coupons and those of the shops in the
   * order, and works out its discount per shop. Several matches: the biggest discount wins.
   */
  private async applyCoupon(
    customerId: string,
    code: string | undefined,
    groups: { shop: { id: string }; subtotal: number }[],
  ): Promise<{ coupon: CouponRule | null; couponError: CouponErrorCode | null; discounts: Map<string, number> }> {
    const none = { coupon: null, discounts: new Map<string, number>() };
    const normalized = code ? normalizeCouponCode(code) : '';
    if (!normalized) return { ...none, couponError: null };

    const rows = await this.prisma.coupon.findMany({
      where: {
        code: { equals: normalized, mode: 'insensitive' },
        OR: [{ shopId: null }, { shopId: { in: groups.map((g) => g.shop.id) } }],
      },
      include: { shop: { select: { ownerId: true } }, _count: { select: { redemptions: { where: { customerId } } } } },
    });
    if (rows.length === 0) return { ...none, couponError: 'COUPON_INVALID' };

    const now = new Date();
    let best: { coupon: CouponRule; discounts: Map<string, number>; amount: number } | null = null;
    let firstError: CouponErrorCode | null = null;
    for (const row of rows) {
      const { shop, _count, ...fields } = row;
      const rule: CouponRule = {
        ...fields,
        value: row.value.toNumber(),
        minOrderAmount: row.minOrderAmount?.toNumber() ?? null,
        maxDiscount: row.maxDiscount?.toNumber() ?? null,
      };
      const eligible = groups
        .filter((g) => rule.shopId === null || g.shop.id === rule.shopId)
        .map((g) => ({ id: g.shop.id, subtotal: g.subtotal }));
      const base = eligible.reduce((n, g) => n + g.subtotal, 0);
      const problem = couponProblem(rule, { base, now, usedByCustomer: _count.redemptions, ownShop: shop?.ownerId === customerId });
      if (problem) {
        firstError ??= problem;
        continue;
      }
      const amount = couponDiscount(rule, base);
      if (!best || amount > best.amount) best = { coupon: rule, discounts: allocateDiscount(amount, eligible), amount };
    }
    return best ? { coupon: best.coupon, couponError: null, discounts: best.discounts } : { ...none, couponError: firstError };
  }

  /** Counts the use inside the order transaction, so the last allowed use can't be taken twice. */
  private async redeemCoupon(tx: Prisma.TransactionClient, rule: CouponRule, customerId: string) {
    const claimed = await tx.coupon.updateMany({
      where: { id: rule.id, ...(rule.usageLimit !== null && { usedCount: { lt: rule.usageLimit } }) },
      data: { usedCount: { increment: 1 } },
    });
    if (claimed.count === 0) throw new ConflictException({ code: 'COUPON_USED_UP', message: 'This coupon has run out' });
    if (rule.perCustomer !== null) {
      const used = await tx.couponRedemption.count({ where: { couponId: rule.id, customerId } });
      if (used >= rule.perCustomer) {
        throw new ConflictException({ code: 'COUPON_ALREADY_USED', message: 'You have already used this coupon' });
      }
    }
  }

  /** Each shop's own urgent delivery settings (shops without any are left out). */
  private async urgentSettings(shopIds: string[]): Promise<Map<string, UrgentDelivery>> {
    const shops = await this.prisma.shop.findMany({ where: { id: { in: shopIds } }, select: { id: true, urgentDelivery: true } });
    return new Map(shops.flatMap((s) => {
      const parsed = parseUrgentDelivery(s.urgentDelivery);
      return parsed?.enabled ? [[s.id, parsed] as const] : [];
    }));
  }

  /** The delivery address (the chosen one, else the default). */
  private address(customerId: string, addressId?: string) {
    return this.prisma.address.findFirst({
      where: addressId ? { id: addressId, customerId } : { customerId },
      orderBy: { isDefault: 'desc' },
      select: { province: true, district: true },
    });
  }

  /** Shops (of these) that offer cash on delivery. */
  private async codShops(shopIds: string[]): Promise<Set<string>> {
    const shops = await this.prisma.shop.findMany({ where: { id: { in: shopIds }, codEnabled: true }, select: { id: true } });
    return new Set(shops.map((s) => s.id));
  }

  private async transferInfo(shopIds: string[]): Promise<Map<string, ShopTransferInfo>> {
    const shops = await this.prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: {
        id: true,
        paymentQrKey: true,
        paymentBankCode: true,
        paymentAccountName: true,
        paymentAccountNumber: true,
      },
    });
    return new Map(
      shops
        // A shop accepts transfers once it has a QR or a full account on file.
        .filter((s) => s.paymentQrKey || (s.paymentAccountNumber && s.paymentAccountName))
        .map((s) => [
          s.id,
          {
            bankCode: s.paymentBankCode,
            accountName: s.paymentAccountName,
            accountNumber: s.paymentAccountNumber,
            hasQr: s.paymentQrKey !== null,
          },
        ]),
    );
  }

  /** Checkout lines for items outside the cart (an order card in a chat). */
  lines(customerId: string, items: VirtualItem[]): Promise<CartLine[]> {
    return this.cart.virtualLines(customerId, items);
  }

  private linesFor(customerId: string, selection: CheckoutSelection): Promise<CartLine[]> {
    return selection.items ? this.cart.virtualLines(customerId, selection.items) : this.selected(customerId, selection.itemIds);
  }

  private async selected(customerId: string, itemIds: string[]): Promise<CartLine[]> {
    const lines = await this.cart.lines(customerId, itemIds);
    if (lines.length === 0 || lines.length !== new Set(itemIds).size) {
      throw new BadRequestException({ code: 'NOTHING_SELECTED', message: 'Select items to check out' });
    }
    return lines;
  }

  private async defaultCommissionRate(): Promise<number> {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'defaultCommissionRate' } });
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_COMMISSION_RATE;
  }
}

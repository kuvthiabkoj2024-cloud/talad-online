import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { formatMoney, MAX_PAYMENT_SLIPS, parseUrgentDelivery, urgentFee, type CheckoutPaymentMethod, type UrgentDelivery } from '@talad/shared';
import { randomInt } from 'node:crypto';
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
import { pointRules } from './order-transitions.js';
import { PaymentSlipsService, slipPrefix, tellAdminsToCheck } from './payment-slips.service.js';
import { PlatformAccountService, type PlatformAccount } from './platform-account.service.js';

const DEFAULT_COMMISSION_RATE = 5;

export interface QuoteIssue {
  itemId: string;
  code: 'UNAVAILABLE' | 'QUANTITY_EXCEEDS_STOCK' | 'OWN_PRODUCT';
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
  /** Shops the customer will collect from in person (when they offer pickup). */
  pickupShopIds?: string[];
  /** Spend loyalty points: as many as the balance and the total allow. */
  usePoints?: boolean;
}

export interface PlaceOrderInput extends CheckoutSelection {
  addressId: string;
  paymentMethod: CheckoutPaymentMethod;
  expectedTotal: number;
  /** BANK_TRANSFER: 1–MAX_PAYMENT_SLIPS slip keys for the whole order (one transfer to Taladonline). */
  slipKeys?: string[];
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
    private readonly cms: CmsService,
    private readonly notifications: NotificationsService,
    private readonly account: PlatformAccountService,
    private readonly slips: PaymentSlipsService,
  ) {}

  /**
   * Totals for the selected cart lines, split per shop, with the coupon discount and where to
   * transfer (Taladonline's account, for the whole order). Delivery isn't priced (paid to the courier). An unusable coupon is
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
    const [transfer, { cod, pickup }, urgentSettings, address, options] = await Promise.all([
      this.account.available(),
      this.shopOptions(groups.map((g) => g.shop.id)),
      this.urgentSettings(groups.map((g) => g.shop.id)),
      this.address(customerId, selection.addressId),
      this.deliveryOptions(customerId, selection.addressId),
    ]);
    const wantsUrgent = new Set(selection.urgentShopIds ?? []);
    const wantsPickup = new Set(selection.pickupShopIds ?? []);
    // Unknown or missing choice falls back to the first courier.
    const courier = options.find((o) => o.id === selection.deliveryProviderId) ?? options[0] ?? null;

    const { coupon, couponError, discounts } = await this.applyCoupon(customerId, selection.couponCode, groups);
    const shops = groups.map((g) => {
      const discount = discounts.get(g.shop.id) ?? 0;
      // The shop's own urgent delivery, when it covers the address (its fee joins the total).
      const settings = urgentSettings.get(g.shop.id);
      const fee = address ? urgentFee(settings, address) : null;
      const urgent = fee !== null ? { fee, eta: settings!.eta } : null;
      // Pickup wins over urgent delivery if both were sent.
      const pickupSelected = pickup.has(g.shop.id) && wantsPickup.has(g.shop.id);
      const urgentSelected = !pickupSelected && urgent !== null && wantsUrgent.has(g.shop.id);
      const shippingFee = urgentSelected ? urgent.fee : 0;
      return {
        ...g,
        discount,
        urgent,
        urgentSelected,
        /** The shop lets customers collect at its address (`pickupAddress`). */
        pickup: pickup.get(g.shop.id) ?? null,
        pickupSelected,
        shippingFee,
        total: g.subtotal - discount + shippingFee,
        /** The shop offers cash on delivery (its own choice, §6). */
        cod: cod.has(g.shop.id),
      };
    });
    // Loyalty points pay part (or all) of the order; Taladonline pays their value back to the
    // shops like a platform coupon. Spread over the shops in proportion to what each costs.
    const [rules, customer] = await Promise.all([pointRules(this.prisma), this.prisma.customer.findUnique({ where: { id: customerId }, select: { pointsBalance: true } })])
    const pointValue = rules.redeemValue && rules.redeemValue > 0 ? rules.redeemValue : 0;
    const balance = Math.max(0, customer?.pointsBalance ?? 0);
    const beforePoints = shops.reduce((n, s) => n + s.total, 0);
    const usable = pointValue ? Math.min(balance, Math.floor(beforePoints / pointValue)) : 0;
    const used = selection.usePoints ? usable : 0;
    const pointShares = allocateDiscount(used, shops.map((s) => ({ id: s.shop.id, subtotal: s.total })));
    const priced = shops.map((s) => {
      const points = pointShares.get(s.shop.id) ?? 0;
      return { ...s, points, pointsDiscount: points * pointValue, total: s.total - points * pointValue };
    });
    const subtotal = priced.reduce((n, s) => n + s.subtotal, 0);
    const discountTotal = priced.reduce((n, s) => n + s.discount, 0);
    const shippingTotal = priced.reduce((n, s) => n + s.shippingFee, 0);
    const pointsDiscount = used * pointValue;
    return {
      couponRule: coupon,
      quote: {
        shops: priced,
        subtotal,
        discountTotal,
        shippingTotal,
        total: subtotal - discountTotal + shippingTotal - pointsDiscount,
        /** The customer's points: how many can go on this order, and what was used (`usePoints`). */
        points: { balance, value: pointValue, usable, used, discount: pointsDiscount },
        issues,
        // No courier is needed when every shop delivers itself or is collected from.
        delivery: { options, selectedId: courier?.id ?? null, needed: priced.some((s) => !s.urgentSelected && !s.pickupSelected) },
        coupon: coupon ? { code: coupon.code, shopId: coupon.shopId, discount: discountTotal } : null,
        couponError,
        // Transfers go to Taladonline's account (checked by an admin), once one is set up.
        transfer: transfer as PlatformAccount | null,
        transferAvailable: transfer !== null,
        // Likewise COD: every shop in the order must have turned it on.
        codAvailable: priced.length > 0 && priced.every((s) => s.cod),
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
    if (quote.delivery.needed && quote.delivery.options.length > 0 && quote.delivery.selectedId !== input.deliveryProviderId) {
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
    // Points can cover the whole order: then there is nothing to transfer or check.
    const paidByPoints = quote.total === 0 && quote.points.used > 0;
    const isTransfer = input.paymentMethod === 'BANK_TRANSFER' && !paidByPoints;
    if (isTransfer) {
      if (!quote.transferAvailable) {
        throw new BadRequestException({ code: 'TRANSFER_UNAVAILABLE', message: 'Transfers are not available right now' });
      }
      // One transfer for the whole order: 1–3 slips (a payment split over several transfers).
      const keys = input.slipKeys ?? [];
      if (keys.length === 0 || keys.length > MAX_PAYMENT_SLIPS || new Set(keys).size !== keys.length || !keys.every((k) => k.startsWith(slipPrefix(customerId)))) {
        throw new BadRequestException({ code: 'SLIP_REQUIRED', message: `Attach 1 to ${MAX_PAYMENT_SLIPS} payment slips` });
      }
    }

    const address = await this.prisma.address.findFirst({ where: { id: input.addressId, customerId } });
    if (!address) throw new BadRequestException({ code: 'ADDRESS_REQUIRED', message: 'Choose a delivery address' });

    const lines = await this.linesFor(customerId, input);
    const defaultRate = await this.defaultCommissionRate();
    const now = new Date();
    // COD (and an order paid in full with points) goes straight to the shops. A transfer waits in
    // "to pay" until Taladonline checks the slips.
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
        const placed = await this.prisma.$transaction(async (tx) => {
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
          // Spend the points (a balance that dropped since the quote refuses the order).
          if (quote.points.used > 0) {
            const { count } = await tx.customer.updateMany({
              where: { id: customerId, pointsBalance: { gte: quote.points.used } },
              data: { pointsBalance: { decrement: quote.points.used } },
            });
            if (!count) throw new ConflictException({ code: 'POINTS_CHANGED', message: 'Your points balance changed, please review your order' });
          }

          const number = orderNumber(now);
          const order = await tx.order.create({
            data: {
              number: `O${number}`,
              customerId,
              shippingAddress,
              subtotal: quote.subtotal,
              discountTotal: quote.discountTotal + quote.points.discount,
              shippingTotal: quote.shippingTotal,
              pointsRedeemed: quote.points.used,
              grandTotal: quote.total,
              note,
            },
          });
          if (quote.points.used > 0) {
            await tx.pointTransaction.create({
              data: { customerId, type: 'REDEEM', points: -quote.points.used, orderId: order.id, note: 'Spent at checkout' },
            });
          }
          if (couponRule) {
            await tx.couponRedemption.create({
              data: { couponId: couponRule.id, customerId, orderId: order.id, amount: quote.discountTotal },
            });
          }
          if (isTransfer) await tx.paymentSlip.createMany({ data: input.slipKeys!.map((key) => ({ orderId: order.id, key, createdAt: now })) });

          const shopOrders: string[] = [];
          for (const [i, group] of quote.shops.entries()) {
            const groupLines = lines.filter((l) => l.shop.id === group.shop.id);
            // A shop coupon is the shop's own discount; a platform coupon is funded by Taladonline.
            const shopDiscount = couponRule?.shopId ? group.discount : 0;
            const platformDiscount = couponRule && !couponRule.shopId ? group.discount : 0;
            const commissions = new Map(groupLines.map((l) => [l.id, l.internal.commission ?? { type: 'PERCENT' as const, value: defaultRate }]));
            const fees = itemCommissions(
              groupLines.map((l) => ({ id: l.id, lineTotal: l.lineTotal, quantity: l.quantity, commission: commissions.get(l.id)! })),
              shopDiscount,
            );
            const shopNumber = quote.shops.length > 1 ? `${number}-${i + 1}` : number;
            await tx.shopOrder.create({
              data: {
                number: shopNumber,
                order: { connect: { id: order.id } },
                shop: { connect: { id: group.shop.id } },
                status,
                // Unpaid orders are cancelled when the shop's payment window ends (OrderDeadlinesService).
                paymentDueAt: status === 'PENDING' ? new Date(now.getTime() + groupLines[0].internal.paymentWindowHrs * 3_600_000) : null,
                subtotal: group.subtotal,
                // Points are Taladonline's discount too (paid back to the shop).
                discountTotal: group.discount + group.pointsDiscount,
                platformDiscount: platformDiscount + group.pointsDiscount,
                pointsRedeemed: group.points,
                // Each item at its own rate (shop override, else its category, else the default).
                commissionAmount: [...fees.values()].reduce((n, f) => n + f, 0),
                total: group.total,
                shippingFee: group.shippingFee,
                urgentDelivery: group.urgentSelected,
                pickup: group.pickupSelected,
                // Urgent delivery and pickup need no courier; other shops go with the chosen one.
                ...(!group.urgentSelected && !group.pickupSelected && quote.delivery.selectedId && { deliveryProvider: { connect: { id: quote.delivery.selectedId } } }),
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
                    ...(commissions.get(l.id)!.type === 'FIXED'
                      ? { commissionFixed: commissions.get(l.id)!.value }
                      : { commissionRate: commissions.get(l.id)!.value }),
                    commissionAmount: fees.get(l.id)!,
                  })),
                },
                // Each shop's share is tracked on its own (paid out to it later, or refunded alone).
                payments: {
                  create: {
                    order: { connect: { id: order.id } },
                    method: input.paymentMethod,
                    status: paidByPoints ? 'PAID' : 'PENDING',
                    amount: group.total,
                    ...(paidByPoints && { paidAt: now }),
                  },
                },
                history: {
                  create: [
                    {
                      toStatus: 'PENDING',
                      actorType: 'CUSTOMER',
                      actorId: customerId,
                      note: isTransfer ? 'Payment slip submitted' : paidByPoints ? 'Paid with points' : null,
                      createdAt: now,
                    },
                    ...(isTransfer
                      ? []
                      : [{ fromStatus: 'PENDING' as const, toStatus: 'CONFIRMED' as const, note: paidByPoints ? 'Paid with points' : 'Cash on delivery', createdAt: now }]),
                  ],
                },
              },
            });
            shopOrders.push(shopNumber);
            // Cash on delivery: the shop hears about it right away (live, with a sound). A
            // transfer reaches the shop only once Taladonline approves the payment.
            if (!isTransfer) {
              const units = groupLines.reduce((n, l) => n + l.quantity, 0);
              await this.notifications.toShop(
                tx,
                group.shop.id,
                'ORDER',
                {
                  lo: { title: `ມີຄຳສັ່ງຊື້ໃໝ່ ${shopNumber}`, body: `${units} ລາຍການ · ${formatMoney(group.total, 'lo')} · ${paidByPoints ? 'ຈ່າຍແລ້ວ' : 'ຈ່າຍປາຍທາງ'}` },
                  en: { title: `New order ${shopNumber}`, body: `${units} item${units === 1 ? '' : 's'} · ${formatMoney(group.total, 'en')} · ${paidByPoints ? 'paid' : 'cash on delivery'}` },
                },
                { link: `/orders/${shopNumber}` },
              );
            }
          }
          if (isTransfer) await tellAdminsToCheck(this.notifications, tx, { number: order.number, total: quote.total });

          if (!input.items) await tx.cartItem.deleteMany({ where: { customerId, id: { in: lines.map((l) => l.id) } } });
          return { orderNumber: order.number, shopOrders, total: quote.total, paymentMethod: input.paymentMethod };
        });
        // Every transfer order is emailed to the admins who check payments (they also get it live).
        if (isTransfer) void this.slips.emailAdmins(placed.orderNumber);
        return placed;
      } catch (e) {
        // Order numbers are random; retry the rare collision.
        const collision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!collision || attempt >= 3) throw e;
      }
    }
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

  /** Shops (of these) that offer cash on delivery, and those customers may collect from (with where). */
  private async shopOptions(shopIds: string[]) {
    const shops = await this.prisma.shop.findMany({
      where: { id: { in: shopIds } },
      select: { id: true, codEnabled: true, pickupEnabled: true, address: true, latitude: true, longitude: true },
    });
    return {
      cod: new Set(shops.filter((s) => s.codEnabled).map((s) => s.id)),
      pickup: new Map(
        shops
          .filter((s) => s.pickupEnabled)
          .map((s) => [s.id, { address: s.address, latitude: s.latitude?.toNumber() ?? null, longitude: s.longitude?.toNumber() ?? null }] as const),
      ),
    };
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

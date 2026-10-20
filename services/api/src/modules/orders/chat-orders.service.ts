import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MAX_CART_QUANTITY, type CheckoutPaymentMethod } from '@talad/shared';
import type { ChatOrder } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { VirtualItem } from '../cart/cart.service.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentSlipsService } from './payment-slips.service.js';

export const CHAT_ORDER_LIMITS = { items: 10 } as const;

export type ChatOrderSource = 'SHOP_CHAT' | 'MARKET_CHAT';
export type ChatOrderCreator = 'CUSTOMER' | 'SHOP' | 'BOT' | 'ASSISTANT';
/** What still has to be chosen before the order can be placed. */
export type ChatOrderMissing = 'OPTION' | 'ADDRESS' | 'PAYMENT' | 'SLIP' | 'ISSUES';

/** What both sides of a chat see on an order card. */
export interface ChatOrderSummary {
  id: string;
  status: 'DRAFT' | 'PLACED' | 'CANCELLED';
  orderNumber: string | null;
  createdBy: ChatOrderCreator;
  items: { name: string; variantLabel: string | null; quantity: number; imageUrl: string | null }[];
  total: number;
}

export interface ChatOrderPatch {
  items?: VirtualItem[];
  addressId?: string;
  deliveryProviderId?: string;
  paymentMethod?: CheckoutPaymentMethod;
  /** "" removes the coupon; null goes back to the shop's best one. */
  couponCode?: string | null;
}

/**
 * Buy by chat: an order card in a chat (the shop's private chat or Market Chat). The
 * customer completes the options, address, courier and payment on the card, and places it
 * through normal checkout — same prices, stock, coupon and payment rules — without touching
 * their cart. Only that customer can see or change the card; the shop sees its summary.
 */
@Injectable()
export class ChatOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly slips: PaymentSlipsService,
  ) {}

  /** A new card (from the customer, the shop, the shop's bot or Market Chat). */
  async create(input: {
    customerId: string;
    shopId: string;
    items: VirtualItem[];
    source: ChatOrderSource;
    createdBy: ChatOrderCreator;
    conversationId?: string;
  }): Promise<ChatOrder> {
    const items = await this.validItems(input.shopId, input.items);
    const shop = await this.prisma.shop.findUnique({ where: { id: input.shopId }, select: { ownerId: true, status: true } });
    if (!shop || shop.status !== 'APPROVED') throw new NotFoundException({ code: 'SHOP_NOT_FOUND', message: 'Shop not found' });
    if (shop.ownerId === input.customerId) throw new ForbiddenException({ code: 'OWN_PRODUCT', message: "You can't buy from your own shop" });
    const address = await this.prisma.address.findFirst({ where: { customerId: input.customerId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }], select: { id: true } });
    const order = await this.prisma.chatOrder.create({
      data: {
        customerId: input.customerId,
        shopId: input.shopId,
        source: input.source,
        createdBy: input.createdBy,
        conversationId: input.conversationId ?? null,
        items: items as unknown as object,
        addressId: address?.id ?? null,
        // One tap for the most common way to pay; changed on the card.
        paymentMethod: 'COD',
      },
    });
    await this.refreshSummary(order.customerId, order.id);
    return order;
  }

  /**
   * The bot updates a card it already sent in this chat instead of sending another
   * ("ສັ່ງຊື້" twice), with any size/quantity the customer just named.
   */
  async openDraftFor(conversationId: string, productId?: string): Promise<ChatOrder | null> {
    const draft = await this.prisma.chatOrder.findFirst({
      where: { conversationId, status: 'DRAFT', createdBy: { in: ['BOT', 'CUSTOMER'] } },
      orderBy: { createdAt: 'desc' },
    });
    const items = (draft?.items ?? []) as unknown as VirtualItem[];
    return draft && items.length === 1 && (!productId || items[0].productId === productId) ? draft : null;
  }

  async adjust(order: ChatOrder, change: { variantId: string | null; quantity: number | null }) {
    const [item] = order.items as unknown as VirtualItem[];
    const items = await this.validItems(order.shopId, [{ productId: item.productId, variantId: change.variantId ?? item.variantId, quantity: change.quantity ?? item.quantity }]);
    await this.prisma.chatOrder.update({ where: { id: order.id }, data: { items: items as unknown as object } });
    await this.refreshSummary(order.customerId, order.id);
  }

  /** The full card for its customer: items with their options, addresses, couriers, payment and totals. */
  async view(customerId: string, id: string) {
    const order = await this.own(customerId, id);
    const items = order.items as unknown as VirtualItem[];
    const [addresses, products, lines, shop] = await Promise.all([
      this.prisma.address.findMany({
        where: { customerId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
        select: { id: true, label: true, recipientName: true, phone: true, province: true, district: true, village: true, line: true, isDefault: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: items.map((i) => i.productId) } },
        select: { id: true, slug: true, variants: { select: { id: true, attributes: true, stock: true } } },
      }),
      this.checkoutLines(customerId, items),
      this.prisma.shop.findUniqueOrThrow({ where: { id: order.shopId }, select: { id: true, slug: true, name: true, logoUrl: true } }),
    ]);
    const addressId = addresses.some((a) => a.id === order.addressId) ? order.addressId : (addresses[0]?.id ?? null);
    const coupon = order.couponCode === null ? await this.bestCoupon(customerId, order, items, addressId) : order.couponCode || undefined;
    const quote = await this.checkout.quote(customerId, {
      itemIds: [],
      items,
      addressId: addressId ?? undefined,
      deliveryProviderId: order.deliveryProviderId ?? undefined,
      couponCode: coupon,
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const view = items.map((item, index) => {
      const line = lines.find((l) => l.id === `chat-${index}`);
      const product = productById.get(item.productId);
      const variants = (product?.variants ?? []).map((v) => ({ id: v.id, attributes: v.attributes as Record<string, string>, stock: v.stock }));
      return {
        index,
        productId: item.productId,
        productSlug: product?.slug ?? '',
        variantId: item.variantId,
        quantity: item.quantity,
        name: line?.name ?? '',
        variantLabel: line?.variantLabel ?? null,
        imageUrl: line?.imageUrl ?? null,
        unitPrice: line?.unitPrice ?? 0,
        compareAtPrice: line?.compareAtPrice ?? null,
        lineTotal: line?.lineTotal ?? 0,
        stock: line?.stock ?? 0,
        available: line?.available ?? false,
        needsOption: variants.length > 0 && !item.variantId,
        variants,
        issue: quote.issues.find((i) => i.itemId === `chat-${index}`)?.code ?? null,
      };
    });
    const transferOk = quote.transferAvailable && quote.paymentMethods.includes('BANK_TRANSFER');
    const paymentMethods = quote.paymentMethods.filter((m) => m !== 'BANK_TRANSFER' || transferOk);
    const paymentMethod = order.paymentMethod && paymentMethods.includes(order.paymentMethod as CheckoutPaymentMethod) ? (order.paymentMethod as CheckoutPaymentMethod) : null;
    const missing: ChatOrderMissing[] = [];
    if (view.some((i) => i.needsOption)) missing.push('OPTION');
    if (!addressId) missing.push('ADDRESS');
    if (!paymentMethod) missing.push('PAYMENT');
    if (paymentMethod === 'BANK_TRANSFER' && !order.slipKey) missing.push('SLIP');
    if (view.some((i) => !i.needsOption && i.issue)) missing.push('ISSUES');
    return {
      id: order.id,
      status: order.status as ChatOrderSummary['status'],
      orderNumber: order.orderNumber,
      createdBy: order.createdBy as ChatOrderCreator,
      source: order.source as ChatOrderSource,
      shop,
      items: view,
      addresses,
      addressId,
      delivery: quote.delivery,
      paymentMethods,
      paymentMethod,
      transfer: quote.shops[0]?.transfer ?? null,
      slipAttached: !!order.slipKey,
      coupon: quote.coupon,
      couponRemoved: order.couponCode === '',
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      total: quote.total,
      missing,
      maxQuantity: MAX_CART_QUANTITY,
    };
  }

  async update(customerId: string, id: string, patch: ChatOrderPatch) {
    const order = await this.draft(customerId, id);
    const data: Record<string, unknown> = {};
    if (patch.items) data.items = (await this.validItems(order.shopId, patch.items)) as unknown as object;
    if (patch.addressId !== undefined) {
      const ok = await this.prisma.address.count({ where: { id: patch.addressId, customerId } });
      if (!ok) throw new BadRequestException({ code: 'ADDRESS_REQUIRED', message: 'Choose a delivery address' });
      data.addressId = patch.addressId;
    }
    if (patch.deliveryProviderId !== undefined) data.deliveryProviderId = patch.deliveryProviderId;
    if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod;
    if (patch.couponCode !== undefined) data.couponCode = patch.couponCode === null ? null : patch.couponCode.trim().toUpperCase();
    await this.prisma.chatOrder.update({ where: { id }, data });
    await this.refreshSummary(customerId, id);
    return this.view(customerId, id);
  }

  /** The transfer slip, sent from the card. */
  async attachSlip(customerId: string, id: string, file: Express.Multer.File | undefined) {
    await this.draft(customerId, id);
    const { slipKey } = await this.slips.uploadCheckoutSlip(customerId, file);
    await this.prisma.chatOrder.update({ where: { id }, data: { slipKey, paymentMethod: 'BANK_TRANSFER' } });
    return this.view(customerId, id);
  }

  /** Places the order through checkout, at exactly the total the customer saw. */
  async place(customerId: string, id: string, expectedTotal: number) {
    const order = await this.draft(customerId, id);
    const card = await this.view(customerId, id);
    const first = card.missing[0];
    if (first) {
      const code = { OPTION: 'OPTION_REQUIRED', ADDRESS: 'ADDRESS_REQUIRED', PAYMENT: 'PAYMENT_REQUIRED', SLIP: 'SLIP_REQUIRED', ISSUES: 'CART_CHANGED' }[first];
      throw new BadRequestException({ code, message: 'Complete the order first' });
    }
    const result = await this.checkout.place(customerId, {
      itemIds: [],
      items: order.items as unknown as VirtualItem[],
      addressId: card.addressId!,
      deliveryProviderId: card.delivery.selectedId ?? undefined,
      couponCode: card.coupon?.code,
      paymentMethod: card.paymentMethod!,
      expectedTotal,
      slips: card.paymentMethod === 'BANK_TRANSFER' && order.slipKey ? { [order.shopId]: order.slipKey } : undefined,
    });
    const now = new Date();
    await this.prisma.chatOrder.update({ where: { id }, data: { status: 'PLACED', orderNumber: result.shopOrders[0], placedAt: now } });
    await this.refreshSummary(customerId, id, result.total);
    // The shop sees it at the top of its chats, as new.
    if (order.conversationId) {
      await this.prisma.shopConversation.update({ where: { id: order.conversationId }, data: { lastMessageAt: now, shopUnread: { increment: 1 } } });
    }
    return { ...(await this.view(customerId, id)), placed: result };
  }

  /** The customer, or the shop for a card in its chat, drops a card that wasn't placed. */
  async cancel(actor: { customerId: string } | { shopId: string }, id: string) {
    const order = await this.prisma.chatOrder.findFirst({ where: { id, ...('customerId' in actor ? { customerId: actor.customerId } : { shopId: actor.shopId }) } });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (order.status !== 'DRAFT') throw new ConflictException({ code: 'ORDER_CLOSED', message: 'This order was already placed or cancelled' });
    await this.prisma.chatOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.refreshSummary(order.customerId, id);
  }

  /** Summaries for cards shown in a chat (the viewer must already be one of its sides). */
  async summaries(ids: string[]): Promise<Map<string, ChatOrderSummary>> {
    if (!ids.length) return new Map();
    const rows = await this.prisma.chatOrder.findMany({ where: { id: { in: ids } }, select: { id: true, summary: true } });
    return new Map(rows.flatMap((r) => (r.summary ? [[r.id, r.summary as unknown as ChatOrderSummary]] : [])));
  }

  /** `total`: what was charged (after the coupon), once placed; otherwise the items' current total. */
  private async refreshSummary(customerId: string, id: string, total?: number) {
    const order = await this.prisma.chatOrder.findUniqueOrThrow({ where: { id } });
    const items = order.items as unknown as VirtualItem[];
    const lines = await this.checkoutLines(customerId, items);
    // Lines still waiting for an option (size…) have no price yet.
    const subtotal = lines.filter((l) => l.available).reduce((n, l) => n + l.lineTotal, 0);
    const summary: ChatOrderSummary = {
      id,
      status: order.status as ChatOrderSummary['status'],
      orderNumber: order.orderNumber,
      createdBy: order.createdBy as ChatOrderCreator,
      items: lines.map((l) => ({ name: l.name, variantLabel: l.variantLabel, quantity: l.quantity, imageUrl: l.imageUrl })),
      total: total ?? subtotal,
    };
    await this.prisma.chatOrder.update({ where: { id }, data: { summary: summary as unknown as object } });
  }

  /** The shop's running coupon that saves the most on this card (applied unless removed). */
  private async bestCoupon(customerId: string, order: ChatOrder, items: VirtualItem[], addressId: string | null): Promise<string | undefined> {
    const now = new Date();
    const coupons = await this.prisma.coupon.findMany({
      where: { shopId: order.shopId, isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { code: true },
      take: 5,
    });
    let best: { code: string; discount: number } | null = null;
    for (const { code } of coupons) {
      const q = await this.checkout.quote(customerId, { itemIds: [], items, couponCode: code, addressId: addressId ?? undefined });
      if (!q.couponError && q.discountTotal > (best?.discount ?? 0)) best = { code, discount: q.discountTotal };
    }
    return best?.code;
  }

  private checkoutLines(customerId: string, items: VirtualItem[]) {
    // Same pricing as checkout (flash sales, blocks, own-shop rule).
    return this.checkout.lines(customerId, items);
  }

  /** Items of this shop only, with real options and sensible quantities. */
  private async validItems(shopId: string, items: VirtualItem[]): Promise<VirtualItem[]> {
    if (!items.length || items.length > CHAT_ORDER_LIMITS.items) throw new BadRequestException({ code: 'NOTHING_SELECTED', message: 'Choose 1–10 products' });
    const products = await this.prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) }, shopId, status: 'PUBLISHED' },
      select: { id: true, variants: { select: { id: true } } },
    });
    return items.map((i) => {
      const p = products.find((x) => x.id === i.productId);
      if (!p) throw new BadRequestException({ code: 'PRODUCT_UNAVAILABLE', message: 'Product not available' });
      const variantId = i.variantId && p.variants.some((v) => v.id === i.variantId) ? i.variantId : null;
      return { productId: p.id, variantId, quantity: Math.max(1, Math.min(MAX_CART_QUANTITY, Math.floor(i.quantity) || 1)) };
    });
  }

  private async own(customerId: string, id: string) {
    const order = await this.prisma.chatOrder.findFirst({ where: { id, customerId } });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return order;
  }

  private async draft(customerId: string, id: string) {
    const order = await this.own(customerId, id);
    if (order.status !== 'DRAFT') throw new ConflictException({ code: 'ORDER_CLOSED', message: 'This order was already placed or cancelled' });
    return order;
  }
}

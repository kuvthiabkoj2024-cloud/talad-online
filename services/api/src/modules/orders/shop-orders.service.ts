import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  SHOP_ORDER_ACTIONS,
  SHOP_ORDER_TABS,
  shopOrderActions,
  type ShopOrderAction,
  type ShopOrderTab,
} from '@talad/shared';
import type { OrderStatus, PaymentMethod, PaymentStatus, Prisma, Shop } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { StorageService } from '../media/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { moveOrder, restoreStock } from './order-transitions.js';
import { paymentOf } from './payment-slips.service.js';
import type { ListShopOrdersQuery, ShopOrderActionDto } from './shop-orders.dto.js';

const HOUR = 3_600_000;
/** Actions that need the seller to say why (shown to the customer). */
const NEEDS_REASON: ShopOrderAction[] = ['cancel', 'reject-payment', 'reject-return'];

const lineSelect = {
  name: true,
  sku: true,
  quantity: true,
  unitPrice: true,
  lineTotal: true,
  variant: { select: { attributes: true } },
  product: { select: { slug: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } } },
} satisfies Prisma.OrderItemSelect;

const orderInclude = {
  items: { select: lineSelect, orderBy: { id: 'asc' } },
  payments: { orderBy: { createdAt: 'desc' }, take: 1 },
  deliveryProvider: { select: { id: true, name: true } },
  shop: { select: { id: true, name: true, slug: true } },
  order: {
    select: {
      number: true,
      note: true,
      shippingAddress: true,
      customer: { select: { id: true, name: true, phone: true } },
      shopOrders: { select: { id: true } },
      payments: { where: { shopOrderId: null }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  },
} satisfies Prisma.ShopOrderInclude;

type OrderRow = Prisma.ShopOrderGetPayload<{ include: typeof orderInclude }>;

export interface ShopOrderLine {
  name: string;
  sku: string;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
  productSlug: string;
}

export interface ShopOrderSummary {
  number: string;
  status: OrderStatus;
  createdAt: Date;
  total: number;
  itemCount: number;
  items: ShopOrderLine[];
  customer: { name: string };
  shop: { id: string; name: string; slug: string };
  payment: { method: PaymentMethod; status: PaymentStatus; hasSlip: boolean } | null;
  /** Transfer slip uploaded; the shop should check it and confirm. */
  awaitingConfirmation: boolean;
  paymentDueAt: Date | null;
}

export interface ShopOrderDetail extends ShopOrderSummary {
  subtotal: number;
  discountTotal: number;
  /** Part of the discount Taladonline funds (platform coupon), paid back to the shop. */
  platformDiscount: number;
  shippingFee: number;
  commissionAmount: number;
  note: string | null;
  customer: { id: string; name: string; phone: string | null };
  shippingAddress: unknown;
  deliveryProvider: { id: string; name: string } | null;
  trackingNumber: string | null;
  autoConfirmAt: Date | null;
  cancelReason: string | null;
  payment: (ShopOrderSummary['payment'] & { amount: number; paidAt: Date | null; slipUploadedAt: Date | null }) | null;
  history: { status: OrderStatus; note: string | null; actor: 'SHOP' | 'CUSTOMER' | 'ADMIN' | null; at: Date }[];
  /** Open escalation to Taladonline (a rejected return). */
  dispute: { status: string; reason: string; createdAt: Date } | null;
  actions: ShopOrderAction[];
}

export interface ShopOrderList {
  items: ShopOrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: Record<ShopOrderTab | 'all', number>;
}

/** Seller Center order queue and fulfilment (§3.6). */
@Injectable()
export class ShopOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  /** `shopId` null = every shop (admin console); `customerId` narrows to one buyer. */
  async list(shopId: string | null, query: ListShopOrdersQuery, customerId?: string): Promise<ShopOrderList> {
    const term = query.q?.trim();
    const where: Prisma.ShopOrderWhereInput = {
      ...(shopId && { shopId }),
      ...(customerId && { order: { customerId } }),
      ...(query.tab && { status: { in: [...SHOP_ORDER_TABS[query.tab]] } }),
      ...(term && {
        OR: [
          { number: { contains: term, mode: 'insensitive' } },
          { order: { customer: { name: { contains: term, mode: 'insensitive' } } } },
          { order: { customer: { phone: { contains: term.replace(/\D/g, '') || term } } } },
        ],
      }),
    };
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.shopOrder.count({ where }),
      this.prisma.shopOrder.groupBy({
        by: ['status'],
        where: { ...(shopId && { shopId }), ...(customerId && { order: { customerId } }) },
        _count: { _all: true },
      }),
    ]);

    const counts = { all: 0 } as ShopOrderList['counts'];
    for (const tab of Object.keys(SHOP_ORDER_TABS) as ShopOrderTab[]) counts[tab] = 0;
    for (const g of byStatus) {
      counts.all += g._count._all;
      const tab = (Object.keys(SHOP_ORDER_TABS) as ShopOrderTab[]).find((t) =>
        (SHOP_ORDER_TABS[t] as readonly OrderStatus[]).includes(g.status),
      );
      if (tab) counts[tab] += g._count._all;
    }
    return {
      items: rows.map((r) => this.summary(r)),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      counts,
    };
  }

  async detail(shopId: string | null, number: string): Promise<ShopOrderDetail> {
    const row = await this.find(shopId, number);
    const [history, dispute] = await Promise.all([
      this.prisma.orderStatusHistory.findMany({ where: { shopOrderId: row.id }, orderBy: { createdAt: 'asc' } }),
      this.prisma.dispute.findFirst({
        where: { shopOrderId: row.id, status: { in: ['OPEN', 'IN_REVIEW'] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    const payment = paymentOf(row);
    const base = this.summary(row);
    return {
      ...base,
      subtotal: row.subtotal.toNumber(),
      discountTotal: row.discountTotal.toNumber(),
      platformDiscount: row.platformDiscount.toNumber(),
      shippingFee: row.shippingFee.toNumber(),
      commissionAmount: row.commissionAmount.toNumber(),
      note: row.order.note,
      customer: row.order.customer,
      shippingAddress: row.order.shippingAddress,
      deliveryProvider: row.deliveryProvider,
      trackingNumber: row.trackingNumber,
      autoConfirmAt: row.autoConfirmAt,
      cancelReason: row.cancelReason,
      payment: payment && {
        ...base.payment!,
        amount: payment.amount.toNumber(),
        paidAt: payment.paidAt,
        slipUploadedAt: payment.slipUploadedAt,
      },
      history: history.map((h) => ({ status: h.toStatus, note: h.note, actor: h.actorType, at: h.createdAt })),
      dispute: dispute && { status: dispute.status, reason: dispute.reason, createdAt: dispute.createdAt },
      // A rejected return waits for Taladonline; nothing more for the shop to do.
      actions: dispute ? [] : shopOrderActions(row.status),
    };
  }

  /** The customer's transfer slip, for the shop to check against its bank. */
  async slip(shopId: string | null, number: string) {
    const row = await this.find(shopId, number);
    const payment = paymentOf(row);
    if (!payment?.slipKey) throw new NotFoundException('No payment slip');
    return this.storage.get(payment.slipKey);
  }

  deliveryProviders() {
    return this.prisma.deliveryProvider.findMany({
      where: { isActive: true },
      select: { id: true, name: true, mode: true },
      orderBy: { name: 'asc' },
    });
  }

  async act(shop: Shop, number: string, dto: ShopOrderActionDto): Promise<ShopOrderDetail> {
    const row = await this.find(shop.id, number);
    const rule = SHOP_ORDER_ACTIONS[dto.action];
    if (!(rule.from as readonly OrderStatus[]).includes(row.status)) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'This order can no longer do that' });
    }
    const reason = dto.reason?.trim() || null;
    if (NEEDS_REASON.includes(dto.action) && !reason) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Tell the customer why' });
    }
    if (dto.action === 'ship' && dto.deliveryProviderId) {
      const provider = await this.prisma.deliveryProvider.findFirst({ where: { id: dto.deliveryProviderId, isActive: true } });
      if (!provider) throw new BadRequestException({ code: 'INVALID_PROVIDER', message: 'Unknown delivery provider' });
    }

    const payment = paymentOf(row);
    const now = new Date();
    const actor = { actorType: 'SHOP' as const, actorId: shop.id };

    await this.prisma.$transaction(async (tx) => {
      const setPayment = (status: PaymentStatus, extra: Prisma.PaymentUpdateInput = {}) =>
        payment ? tx.payment.update({ where: { id: payment.id }, data: { status, ...extra } }) : null;
      let moved = true;

      switch (dto.action) {
        case 'confirm':
          moved = await moveOrder(tx, row.id, row.status, 'CONFIRMED', {}, { ...actor, note: reason });
          if (moved && payment && payment.method !== 'COD' && payment.status !== 'PAID') {
            await setPayment('PAID', { paidAt: now });
          }
          break;
        case 'pack':
          moved = await moveOrder(tx, row.id, row.status, 'PACKED', {}, actor);
          break;
        case 'ship':
          moved = await moveOrder(
            tx,
            row.id,
            row.status,
            'SHIPPED',
            {
              trackingNumber: dto.trackingNumber?.trim() || null,
              ...(dto.deliveryProviderId && { deliveryProviderId: dto.deliveryProviderId }),
            },
            { ...actor, note: dto.trackingNumber?.trim() || null },
          );
          break;
        case 'deliver':
          moved = await moveOrder(
            tx,
            row.id,
            row.status,
            'DELIVERED',
            { autoConfirmAt: new Date(now.getTime() + shop.autoConfirmHrs * HOUR) },
            actor,
          );
          // Cash on delivery is collected on handover.
          if (moved && payment?.method === 'COD' && payment.status !== 'PAID') await setPayment('PAID', { paidAt: now });
          break;
        case 'cancel':
        case 'reject-payment':
        case 'approve-return': {
          const note = reason ?? (dto.action === 'approve-return' ? 'Return approved' : null);
          moved = await moveOrder(tx, row.id, row.status, 'CANCELLED', { cancelReason: note }, { ...actor, note });
          if (!moved) break;
          await restoreStock(tx, row.id);
          // Paid orders are refunded by the shop/platform outside the app; record it.
          if (payment) await setPayment(payment.status === 'PAID' ? 'REFUNDED' : 'FAILED');
          break;
        }
        case 'reject-return':
          await tx.dispute.create({
            data: { shopOrderId: row.id, raisedBy: 'SHOP', reason: reason!, details: 'Return request rejected by the shop' },
          });
          await tx.orderStatusHistory.create({
            data: { shopOrderId: row.id, fromStatus: row.status, toStatus: row.status, ...actor, note: `Escalated: ${reason}` },
          });
          break;
      }
      if (!moved) throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'This order was just updated' });

      const to = rule.to;
      if (to) {
        await this.notifications.notifyOrder(
          tx,
          {
            customerId: row.order.customer.id,
            number: row.number,
            shopName: shop.name,
            imageKey: row.items[0]?.product.images[0]?.key,
          },
          to,
          to === 'CANCELLED' ? reason : null,
        );
      }
    });
    return this.detail(shop.id, number);
  }

  private async find(shopId: string | null, number: string): Promise<OrderRow> {
    const row = await this.prisma.shopOrder.findFirst({ where: { number, ...(shopId && { shopId }) }, include: orderInclude });
    if (!row) throw new NotFoundException('Order not found');
    return row;
  }

  private summary(r: OrderRow): ShopOrderSummary {
    const payment = paymentOf(r);
    return {
      number: r.number,
      status: r.status,
      createdAt: r.createdAt,
      total: r.total.toNumber(),
      itemCount: r.items.reduce((n, i) => n + i.quantity, 0),
      items: r.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        variant: i.variant ? Object.values(i.variant.attributes as Record<string, string>).join(' / ') : null,
        quantity: i.quantity,
        unitPrice: i.unitPrice.toNumber(),
        lineTotal: i.lineTotal.toNumber(),
        imageUrl: i.product.images[0] ? this.media.publicUrl(i.product.images[0].key) : null,
        productSlug: i.product.slug,
      })),
      customer: { name: r.order.customer.name },
      shop: r.shop,
      payment: payment && { method: payment.method, status: payment.status, hasSlip: payment.slipKey !== null },
      awaitingConfirmation: r.status === 'PENDING' && !!payment?.slipKey && payment.status === 'PENDING',
      paymentDueAt: r.paymentDueAt,
    };
  }
}

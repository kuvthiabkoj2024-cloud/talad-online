import { Injectable, NotFoundException } from '@nestjs/common';
import { ORDER_TABS, type OrderTab } from '@talad/shared';
import type { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import type { ListOrdersQuery } from './list-orders.query.js';
import { paymentOf } from './payment-slips.service.js';

export interface OrderLine {
  productSlug: string;
  name: string;
  variant: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
}

export interface OrderSummary {
  number: string;
  status: OrderStatus;
  /** Transfer slip uploaded and waiting for the shop to confirm it. */
  awaitingConfirmation: boolean;
  createdAt: Date;
  total: number;
  itemCount: number;
  shop: { slug: string; name: string };
  /** First few lines, for the list card. */
  items: OrderLine[];
}

export interface OrderDetail extends Omit<OrderSummary, 'items'> {
  orderNumber: string;
  updatedAt: Date;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  currency: string;
  trackingNumber: string | null;
  deliveryProvider: string | null;
  paymentDueAt: Date | null;
  autoConfirmAt: Date | null;
  cancelReason: string | null;
  shippingAddress: unknown;
  shop: { slug: string; name: string; logoUrl: string | null };
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    paidAt: Date | null;
    slipUploadedAt: Date | null;
  } | null;
  /** Where to transfer when paying this order manually (null if the shop takes no transfers). */
  transfer: { bankCode: string | null; accountName: string | null; accountNumber: string | null; hasQr: boolean } | null;
  note: string | null;
  items: OrderLine[];
  history: { status: OrderStatus; note: string | null; at: Date }[];
}

const LIST_ITEMS = 3;

const lineSelect = {
  name: true,
  sku: true,
  quantity: true,
  unitPrice: true,
  lineTotal: true,
  variant: { select: { attributes: true } },
  product: {
    select: {
      slug: true,
      images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
    },
  },
} satisfies Prisma.OrderItemSelect;

type LineRow = Prisma.OrderItemGetPayload<{ select: typeof lineSelect }>;

/** Enough to resolve a shop order's payment (its own, or a legacy order-level one). */
const paymentSelect = {
  payments: { orderBy: { createdAt: 'desc' }, take: 1 },
  order: {
    select: {
      shopOrders: { select: { id: true } },
      payments: { where: { shopOrderId: null }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
  },
} satisfies Prisma.ShopOrderSelect;

/** A customer's own orders (§4.5). Customers see one order per shop (ShopOrder). */
@Injectable()
export class CustomerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async list(customerId: string, { tab, page, pageSize }: ListOrdersQuery) {
    const mine = { order: { customerId } } satisfies Prisma.ShopOrderWhereInput;

    const [rows, grouped] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where: { ...mine, ...(tab && { status: { in: [...ORDER_TABS[tab]] } }) },
        // number breaks ties so pages never overlap or skip rows
        orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          number: true,
          status: true,
          createdAt: true,
          total: true,
          shop: { select: { slug: true, name: true } },
          items: { select: lineSelect, take: LIST_ITEMS },
          _count: { select: { items: true } },
          ...paymentSelect,
        },
      }),
      this.prisma.shopOrder.groupBy({ by: ['status'], where: mine, _count: true }),
    ]);

    const byStatus = new Map(grouped.map((g) => [g.status, g._count]));
    const counts = Object.fromEntries(
      Object.entries(ORDER_TABS).map(([key, statuses]) => [
        key,
        statuses.reduce((sum, s) => sum + (byStatus.get(s) ?? 0), 0),
      ]),
    ) as Record<OrderTab, number>;
    const all = grouped.reduce((sum, g) => sum + g._count, 0);

    const orders: OrderSummary[] = rows.map((o) => ({
      number: o.number,
      status: o.status,
      awaitingConfirmation: o.status === 'PENDING' && Boolean(paymentOf(o)?.slipKey),
      createdAt: o.createdAt,
      total: o.total.toNumber(),
      itemCount: o._count.items,
      shop: o.shop,
      items: o.items.map((i) => this.line(i)),
    }));

    // The per-status counts already give the filtered total — no extra COUNT query.
    const total = tab ? counts[tab] : all;
    return {
      counts: { all, ...counts },
      orders,
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async detail(customerId: string, number: string): Promise<OrderDetail> {
    const o = await this.prisma.shopOrder.findFirst({
      where: { number, order: { customerId } },
      include: {
        payments: { orderBy: { createdAt: 'desc' }, take: 1 },
        order: {
          select: {
            number: true,
            currency: true,
            note: true,
            shippingAddress: true,
            shopOrders: { select: { id: true } },
            payments: { where: { shopOrderId: null }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        shop: {
          select: {
            slug: true,
            name: true,
            logoUrl: true,
            paymentQrKey: true,
            paymentBankCode: true,
            paymentAccountName: true,
            paymentAccountNumber: true,
          },
        },
        deliveryProvider: { select: { name: true } },
        items: { select: lineSelect },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!o) throw new NotFoundException('Order not found');

    const payment = paymentOf(o);
    const acceptsTransfer = Boolean(o.shop.paymentQrKey || (o.shop.paymentAccountNumber && o.shop.paymentAccountName));
    return {
      number: o.number,
      orderNumber: o.order.number,
      status: o.status,
      awaitingConfirmation: o.status === 'PENDING' && Boolean(payment?.slipKey),
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      subtotal: o.subtotal.toNumber(),
      discountTotal: o.discountTotal.toNumber(),
      shippingFee: o.shippingFee.toNumber(),
      total: o.total.toNumber(),
      currency: o.order.currency,
      itemCount: o.items.length,
      trackingNumber: o.trackingNumber,
      deliveryProvider: o.deliveryProvider?.name ?? null,
      paymentDueAt: o.paymentDueAt,
      autoConfirmAt: o.autoConfirmAt,
      cancelReason: o.cancelReason,
      shippingAddress: o.order.shippingAddress,
      shop: {
        slug: o.shop.slug,
        name: o.shop.name,
        logoUrl: o.shop.logoUrl ? this.media.publicUrl(o.shop.logoUrl) : null,
      },
      payment: payment
        ? {
            method: payment.method,
            status: payment.status,
            amount: payment.amount.toNumber(),
            paidAt: payment.paidAt,
            slipUploadedAt: payment.slipUploadedAt,
          }
        : null,
      transfer: acceptsTransfer
        ? {
            bankCode: o.shop.paymentBankCode,
            accountName: o.shop.paymentAccountName,
            accountNumber: o.shop.paymentAccountNumber,
            hasQr: o.shop.paymentQrKey !== null,
          }
        : null,
      note: o.order.note,
      items: o.items.map((i) => this.line(i)),
      history: o.history.map((h) => ({ status: h.toStatus, note: h.note, at: h.createdAt })),
    };
  }

  private line(i: LineRow): OrderLine {
    const attributes = i.variant?.attributes as Record<string, string> | undefined;
    const image = i.product.images[0];
    return {
      productSlug: i.product.slug,
      name: i.name,
      variant: attributes ? Object.values(attributes).join(' / ') : null,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice.toNumber(),
      lineTotal: i.lineTotal.toNumber(),
      imageUrl: image ? this.media.publicUrl(image.key) : null,
    };
  }
}

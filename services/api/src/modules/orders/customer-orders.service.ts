import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BILL_REPORTED_NOTE, ORDER_TABS, billCorrectable, returnDeadline, returnOpen, type DepositStatus, type GuaranteeUnit, type OrderTab } from '@talad/shared';
import type { OrderStatus, PaymentMethod, PaymentStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { ListOrdersQuery } from './list-orders.query.js';
import { addSold, awardPoints, markCodPaid, moveOrder, pointsFor, restoreStock, returnPoints } from './order-transitions.js';
import { paymentCheck, paymentOf, type PaymentCheck, type SlipView } from './payment-slips.service.js';
import { PlatformAccountService, type PlatformAccount } from './platform-account.service.js';

export interface OrderLine {
  productSlug: string;
  name: string;
  variant: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
  guarantee: { duration: number; unit: GuaranteeUnit; terms: string | null } | null;
}

export interface OrderSummary {
  number: string;
  status: OrderStatus;
  /** Transfer slips sent and waiting for MC Mart's check. */
  awaitingConfirmation: boolean;
  /** Where the transfer stands: being checked, rejected (send new slips), approved. */
  paymentCheck: PaymentCheck;
  /** Unpaid and not waiting for a check (slips rejected, or none sent): the customer may cancel. */
  cancellable?: boolean;
  createdAt: Date;
  total: number;
  itemCount: number;
  shop: { slug: string; name: string };
  /** First few lines, for the list card. */
  items: OrderLine[];
}

export interface OrderDetail extends Omit<OrderSummary, 'items'> {
  orderNumber: string;
  /** The customer can ask to return it now; for a completed order, until `returnDeadline`. */
  returnable: boolean;
  returnDeadline: Date | null;
  returnRequest: { raisedBy: string; reason: string; details: string | null; status: string; resolution: string | null; files: number; createdAt: Date } | null;
  updatedAt: Date;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  currency: string;
  trackingNumber: string | null;
  /** The shop uploaded a photo of the courier's bill when shipping. */
  hasShippingBill: boolean;
  /** When the customer reported the bill as wrong, until the shop uploads a new one. */
  billIssueAt: Date | null;
  /** The bill can be reported as wrong now. */
  billReportable: boolean;
  /** Urgent delivery by the shop itself (its fee is `shippingFee`). */
  urgentDelivery: boolean;
  /** Collected at the shop: where to go (the shop's address and map pin). */
  pickup: { address: string | null; phone: string; latitude: number | null; longitude: number | null } | null;
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
    /** A paid order that was cancelled: when MC Mart sent the money back. */
    refundedAt: Date | null;
  } | null;
  /** MC Mart's account to transfer to (null when transfers aren't set up). */
  transfer: PlatformAccount | null;
  /** One transfer pays the whole checkout (all its shops): this much. */
  orderTotal: number;
  /** Slips sent for the checkout, newest first, with MC Mart's verdict. */
  slips: SlipView[];
  /** Loyalty points this order earned: they're taken back if it is returned. */
  pointsEarned: number;
  /** When the order completed: any guarantees start here. Null if it isn't complete. */
  completedAt: Date | null;
  deposit: {
    amount: number;
    status: DepositStatus;
    rejectReason: string | null;
    dueAt: Date | null;
    shopId: string;
    /** Where to send a new slip's money, while the shop waits for one. */
    account: { bankCode: string | null; accountName: string | null; accountNumber: string | null; hasQr: boolean } | null;
  } | null;
  /** What's left to pay in cash on delivery (the total less the deposit). */
  collectOnDelivery: number;
  /** Loyalty points for confirming receipt (an order that completes on its own earns none). */
  pointsOnReceive: number;
  /** Nothing in this order earns points: promotion goods or a coupon. */
  noPoints: boolean;
  /** Points spent on this shop order (their value is part of `discountTotal`). */
  pointsUsed: number;
  note: string | null;
  items: OrderLine[];
  history: { status: OrderStatus; note: string | null; at: Date }[];
}

const LIST_ITEMS = 3;

const lineSelect = {
  name: true,
  sku: true,
  guaranteeDuration: true,
  guaranteeUnit: true,
  guaranteeTerms: true,
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
      slips: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, rejectReason: true, createdAt: true } },
    },
  },
} satisfies Prisma.ShopOrderSelect;

/** A customer's own orders (§4.5). Customers see one order per shop (ShopOrder). */
@Injectable()
export class CustomerOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    private readonly account: PlatformAccountService,
  ) {}

  /**
   * The customer confirms they got a sent order: it completes now instead of AUTO_COMPLETE_DAYS
   * after shipping (same effects as the automatic sweep — sold count, points).
   * A problem with it can still be reported for RETURN_RULES.windowDays (OrderReturnsService).
   */
  async receive(customerId: string, number: string): Promise<{ status: OrderStatus }> {
    const o = await this.prisma.shopOrder.findFirst({
      where: { number, order: { customerId } },
      select: {
        id: true,
        number: true,
        status: true,
        shopId: true,
        shop: { select: { name: true } },
        items: { take: 1, select: { product: { select: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } } } } },
      },
    });
    if (!o) throw new NotFoundException('Order not found');
    if (o.status !== 'SHIPPED' && o.status !== 'DELIVERED') {
      throw new ConflictException({ code: 'ORDER_NOT_DELIVERED', message: 'Only a sent order can be marked as received' });
    }
    await this.prisma.$transaction(async (tx) => {
      const moved = await moveOrder(tx, o.id, o.status, 'COMPLETED', {}, { actorType: 'CUSTOMER', actorId: customerId, note: 'Received by customer' });
      if (!moved) throw new ConflictException({ code: 'ORDER_NOT_DELIVERED', message: 'Only a sent order can be marked as received' });
      await markCodPaid(tx, o.id);
      await addSold(tx, o.id);
      await awardPoints(tx, o.id);
      const imageKey = o.items[0]?.product.images[0]?.key;
      await this.notifications.notifyOrder(tx, { customerId, number: o.number, shopName: o.shop.name, imageKey }, 'COMPLETED');
      await this.notifications.toShop(
        tx,
        o.shopId,
        'ORDER',
        {
          lo: { title: `ລູກຄ້າໄດ້ຮັບສິນຄ້າແລ້ວ ${o.number}`, body: 'ຄຳສັ່ງຊື້ສຳເລັດ — ນັບເຂົ້າລາຍຮັບຂອງທ່ານແລ້ວ.' },
          en: { title: `Customer received ${o.number}`, body: 'The order is complete and counts toward your earnings.' },
        },
        { link: `/orders/${o.number}` },
      );
    });
    return { status: 'COMPLETED' };
  }

  /** The bill the shop uploaded is wrong: asks it for a new one. Once per bill, so it can't be used to spam the shop. */
  async reportBill(customerId: string, number: string): Promise<{ billIssueAt: Date }> {
    const o = await this.prisma.shopOrder.findFirst({
      where: { number, order: { customerId } },
      select: { id: true, number: true, status: true, shopId: true, shippingBillKey: true, billIssueAt: true },
    });
    if (!o) throw new NotFoundException('Order not found');
    if (!o.shippingBillKey || !billCorrectable(o.status)) {
      throw new ConflictException({ code: 'BILL_NOT_REPORTABLE', message: 'This bill can no longer be reported' });
    }
    if (o.billIssueAt) return { billIssueAt: o.billIssueAt };

    const billIssueAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.shopOrder.updateMany({ where: { id: o.id, status: o.status, billIssueAt: null }, data: { billIssueAt } });
      if (!count) return;
      await tx.orderStatusHistory.create({
        data: { shopOrderId: o.id, fromStatus: o.status, toStatus: o.status, actorType: 'CUSTOMER', actorId: customerId, note: BILL_REPORTED_NOTE },
      });
      await this.notifications.toShop(
        tx,
        o.shopId,
        'ORDER',
        {
          lo: { title: `ລູກຄ້າແຈ້ງວ່າໃບບິນຜິດ ${o.number}`, body: 'ກະລຸນາກວດສອບ ແລະ ອັບໂຫຼດໃບບິນໃໝ່.' },
          en: { title: `Wrong bill reported ${o.number}`, body: 'Please check it and upload the right one.' },
        },
        { link: `/orders/${o.number}` },
      );
    });
    return { billIssueAt };
  }

  /**
   * The customer gives up on an unpaid transfer: allowed once MC Mart rejected the slips (or
   * none were sent), never while slips wait for the check or after one was approved. One transfer
   * pays the whole checkout, so every shop in it is cancelled; stock and points come back.
   */
  async cancel(customerId: string, number: string): Promise<{ status: OrderStatus }> {
    const o = await this.prisma.shopOrder.findFirst({
      where: { number, order: { customerId } },
      select: {
        status: true,
        order: {
          select: {
            slips: { select: { status: true } },
            shopOrders: { where: { status: 'PENDING' }, select: { id: true, number: true, shop: { select: { name: true } } } },
          },
        },
      },
    });
    if (!o) throw new NotFoundException('Order not found');
    const check = paymentCheck(o.order.slips);
    if (o.status !== 'PENDING' || check === 'reviewing' || check === 'approved') {
      throw new ConflictException({ code: 'NOT_CANCELLABLE', message: 'This order can no longer be cancelled' });
    }
    const note = 'Cancelled by customer';
    await this.prisma.$transaction(async (tx) => {
      for (const so of o.order.shopOrders) {
        if (!(await moveOrder(tx, so.id, 'PENDING', 'CANCELLED', { cancelReason: note }, { actorType: 'CUSTOMER', actorId: customerId, note }))) continue;
        await restoreStock(tx, so.id);
        await returnPoints(tx, so.id);
        await tx.payment.updateMany({ where: { shopOrderId: so.id, status: 'PENDING' }, data: { status: 'FAILED' } });
      }
    });
    return { status: 'CANCELLED' };
  }

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
      awaitingConfirmation: o.status === 'PENDING' && paymentCheck(o.order.slips) === 'reviewing',
      paymentCheck: o.status === 'PENDING' ? paymentCheck(o.order.slips) : null,
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
            grandTotal: true,
            shippingAddress: true,
            shopOrders: { select: { id: true } },
            payments: { where: { shopOrderId: null }, orderBy: { createdAt: 'desc' }, take: 1 },
            slips: { orderBy: { createdAt: 'desc' }, select: { id: true, status: true, rejectReason: true, createdAt: true } },
          },
        },
        shop: { select: { id: true, slug: true, name: true, logoUrl: true, address: true, phone: true, latitude: true, longitude: true, paymentQrKey: true, paymentBankCode: true, paymentAccountName: true, paymentAccountNumber: true } },
        deliveryProvider: { select: { name: true } },
        items: { select: lineSelect },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!o) throw new NotFoundException('Order not found');

    const payment = paymentOf(o);
    const check = paymentCheck(o.order.slips);
    const dispute = await this.prisma.dispute.findFirst({ where: { shopOrderId: o.id }, orderBy: { createdAt: 'desc' } });
    const completedAt = o.history.findLast((h) => h.toStatus === 'COMPLETED')?.createdAt ?? null;
    return {
      number: o.number,
      orderNumber: o.order.number,
      // One request per order; a completed one already in a payout (older orders) goes through support.
      returnable: !dispute && !o.payoutId && returnOpen(o.status, completedAt),
      returnDeadline: o.status === 'COMPLETED' && completedAt ? returnDeadline(completedAt) : null,
      returnRequest: dispute && {
        raisedBy: dispute.raisedBy,
        reason: dispute.reason,
        details: dispute.details,
        status: dispute.status,
        resolution: dispute.resolution,
        files: dispute.evidenceKeys.length,
        createdAt: dispute.createdAt,
      },
      status: o.status,
      awaitingConfirmation: o.status === 'PENDING' && check === 'reviewing',
      paymentCheck: o.status === 'PENDING' ? check : null,
      cancellable: o.status === 'PENDING' && check !== 'reviewing' && check !== 'approved',
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      subtotal: o.subtotal.toNumber(),
      discountTotal: o.discountTotal.toNumber(),
      shippingFee: o.shippingFee.toNumber(),
      total: o.total.toNumber(),
      currency: o.order.currency,
      itemCount: o.items.length,
      trackingNumber: o.trackingNumber,
      hasShippingBill: o.shippingBillKey !== null,
      billIssueAt: o.billIssueAt,
      billReportable: o.shippingBillKey !== null && o.billIssueAt === null && billCorrectable(o.status),
      urgentDelivery: o.urgentDelivery,
      pickup: o.pickup
        ? { address: o.shop.address, phone: o.shop.phone, latitude: o.shop.latitude?.toNumber() ?? null, longitude: o.shop.longitude?.toNumber() ?? null }
        : null,
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
            refundedAt: payment.refundedAt,
          }
        : null,
      transfer: o.status === 'PENDING' ? await this.account.available() : null,
      orderTotal: o.order.grandTotal.toNumber(),
      pointsOnReceive: o.status === 'SHIPPED' || o.status === 'DELIVERED' ? await pointsFor(this.prisma, o) : 0,
      noPoints: o.pointsBase?.isZero() ?? false,
      pointsEarned: o.pointsEarned,
      completedAt: o.status === 'COMPLETED' ? completedAt : null,
      deposit: o.depositStatus && {
        amount: o.depositAmount.toNumber(),
        status: o.depositStatus,
        rejectReason: o.depositRejectReason,
        dueAt: o.depositDueAt,
        shopId: o.shop.id,
        account: o.depositStatus === 'REJECTED' ? { bankCode: o.shop.paymentBankCode, accountName: o.shop.paymentAccountName, accountNumber: o.shop.paymentAccountNumber, hasQr: o.shop.paymentQrKey !== null } : null,
      },
      collectOnDelivery: Math.max(0, o.total.toNumber() - o.depositAmount.toNumber()),
      pointsUsed: o.pointsRedeemed,
      slips: o.order.slips,
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
      guarantee: i.guaranteeDuration && i.guaranteeUnit ? { duration: i.guaranteeDuration, unit: i.guaranteeUnit, terms: i.guaranteeTerms } : null,
    };
  }
}

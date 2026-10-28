import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { formatMoney } from '@talad/shared';
import type { AdminUser, Prisma, SlipStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../media/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { moveOrder } from './order-transitions.js';

const HOUR = 3_600_000;
/** After a rejection the customer has at least this long to send new slips. */
const RESEND_WINDOW_MS = 24 * HOUR;

/** Payment queue tabs: slips to check, rejected (waiting for the customer), approved. */
export const PAYMENT_QUEUES = ['review', 'rejected', 'approved'] as const;
export type PaymentQueue = (typeof PAYMENT_QUEUES)[number];
export const REFUND_QUEUES = ['due', 'done'] as const;
export type RefundQueue = (typeof REFUND_QUEUES)[number];

const num = (d: Prisma.Decimal | null | undefined) => d?.toNumber() ?? 0;

const orderInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  shopOrders: {
    orderBy: { number: 'asc' },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      paymentDueAt: true,
      shop: { select: { id: true, name: true } },
      items: { take: 1, select: { product: { select: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } } } } },
      payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, method: true, status: true, amount: true } },
    },
  },
  slips: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.OrderInclude;
type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

function queueWhere(queue: PaymentQueue): Prisma.OrderWhereInput {
  const waiting = { shopOrders: { some: { status: 'PENDING' as const } } };
  if (queue === 'review') return { ...waiting, slips: { some: { status: 'PENDING' } } };
  if (queue === 'rejected') return { ...waiting, slips: { some: { status: 'REJECTED' }, none: { status: 'PENDING' } } };
  return { slips: { some: { status: 'APPROVED' } } };
}

/**
 * Taladonline checks customers' transfers (§2.10): a transfer order reaches its shops only
 * once an admin approves its slips; a rejection asks the customer for new ones. Paid orders a
 * shop can't fill come back here as refunds to make.
 */
@Injectable()
export class PaymentReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async queue(queue: PaymentQueue, page: number, pageSize: number) {
    const where = queueWhere(queue);
    const [rows, total, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        // Oldest first while waiting (first come, first checked); newest first once approved.
        orderBy: { createdAt: queue === 'approved' ? 'desc' : 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
      Promise.all(PAYMENT_QUEUES.map((q) => this.prisma.order.count({ where: queueWhere(q) }))),
    ]);
    return {
      items: rows.map((o) => this.view(o)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      counts: Object.fromEntries(PAYMENT_QUEUES.map((q, i) => [q, counts[i]])) as Record<PaymentQueue, number>,
    };
  }

  async detail(number: string) {
    return this.view(await this.find(number));
  }

  async slipImage(slipId: string) {
    const slip = await this.prisma.paymentSlip.findUnique({ where: { id: slipId }, select: { key: true } });
    if (!slip) throw new NotFoundException('Slip not found');
    return this.storage.get(slip.key);
  }

  /** The money arrived: the order is paid and each of its shops gets it to pack and ship. */
  async approve(admin: AdminUser, number: string, ip?: string) {
    const o = await this.find(number);
    if (!o.slips.some((s) => s.status === 'PENDING')) throw new ConflictException({ code: 'NOTHING_TO_CHECK', message: 'No slips are waiting to be checked' });
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentSlip.updateMany({ where: { orderId: o.id, status: 'PENDING' }, data: { status: 'APPROVED', reviewedById: admin.id, reviewedAt: now } });
      for (const so of o.shopOrders) {
        if (so.status !== 'PENDING') continue;
        const moved = await moveOrder(tx, so.id, 'PENDING', 'CONFIRMED', {}, { actorType: 'ADMIN', actorId: admin.id, note: 'Payment checked by Taladonline' });
        if (!moved) continue;
        await tx.payment.updateMany({ where: { shopOrderId: so.id, status: 'PENDING' }, data: { status: 'PAID', paidAt: now } });
        await this.notifications.notifyOrder(
          tx,
          { customerId: o.customer.id, number: so.number, shopName: so.shop.name, imageKey: so.items[0]?.product.images[0]?.key },
          'CONFIRMED',
        );
        await this.notifications.toShop(
          tx,
          so.shop.id,
          'ORDER',
          {
            lo: { title: `ມີຄຳສັ່ງຊື້ໃໝ່ ${so.number} · ຈ່າຍແລ້ວ`, body: `${formatMoney(num(so.total), 'lo')} · ກະລຸນາແພັກ ແລະ ສົ່ງສິນຄ້າ.` },
            en: { title: `New paid order ${so.number}`, body: `${formatMoney(num(so.total), 'en')} · Please pack and ship it.` },
          },
          { link: `/orders/${so.number}` },
        );
      }
      await this.audit.log({ adminId: admin.id, action: 'payment.approve', entityType: 'Order', entityId: o.id, changes: { number }, ip }, tx);
    });
    return this.detail(number);
  }

  /**
   * The transfer can't be found or doesn't match: the customer is asked for new slips. Until
   * they send them the shops never hear of the order (it cancels when its payment time ends).
   */
  async reject(admin: AdminUser, number: string, rawReason: string, ip?: string) {
    const reason = rawReason.trim();
    if (!reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Tell the customer why' });
    const o = await this.find(number);
    if (!o.slips.some((s) => s.status === 'PENDING')) throw new ConflictException({ code: 'NOTHING_TO_CHECK', message: 'No slips are waiting to be checked' });
    const now = new Date();
    const resendBy = new Date(now.getTime() + RESEND_WINDOW_MS);
    const waiting = o.shopOrders.filter((so) => so.status === 'PENDING');
    await this.prisma.$transaction(async (tx) => {
      await tx.paymentSlip.updateMany({ where: { orderId: o.id, status: 'PENDING' }, data: { status: 'REJECTED', rejectReason: reason, reviewedById: admin.id, reviewedAt: now } });
      for (const so of waiting) {
        // Time to send new slips before the order is cancelled for non-payment.
        if (!so.paymentDueAt || so.paymentDueAt < resendBy) await tx.shopOrder.update({ where: { id: so.id }, data: { paymentDueAt: resendBy } });
        await tx.orderStatusHistory.create({
          data: { shopOrderId: so.id, fromStatus: 'PENDING', toStatus: 'PENDING', actorType: 'ADMIN', actorId: admin.id, note: `Payment slip rejected: ${reason}` },
        });
      }
      const first = waiting[0];
      if (first) {
        await this.notifications.send(
          tx,
          o.customer.id,
          'ORDER',
          {
            lo: { title: `ກະລຸນາສົ່ງສະລິບໃໝ່ · ${o.number.replace(/^O/, '')}`, body: `Taladonline ກວດບໍ່ພົບການໂອນ: ${reason}. ສົ່ງສະລິບໃໝ່ໄດ້ສູງສຸດ 3 ຮູບ.` },
            en: { title: `Please send a new slip · ${o.number.replace(/^O/, '')}`, body: `Taladonline couldn't confirm your transfer: ${reason}. You can send up to 3 new slips.` },
          },
          { link: `/account/orders/${first.number}` },
        );
      }
      await this.audit.log({ adminId: admin.id, action: 'payment.reject', entityType: 'Order', entityId: o.id, changes: { number, reason }, ip }, tx);
    });
    return this.detail(number);
  }

  /* ── Refunds: paid orders that were cancelled (out of stock, cancelled by the shop) ── */

  async refunds(queue: RefundQueue, page: number, pageSize: number) {
    const where = this.refundWhere(queue);
    const [rows, total, due] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where,
        orderBy: { updatedAt: queue === 'due' ? 'asc' : 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.refundSelect,
      }),
      this.prisma.shopOrder.count({ where }),
      this.prisma.shopOrder.count({ where: this.refundWhere('due') }),
    ]);
    return {
      items: await Promise.all(rows.map((r) => this.refundView(r))),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      counts: { due },
    };
  }

  /** The admin sent the money back to the customer (e.g. to their saved refund account). */
  async markRefunded(admin: AdminUser, shopOrderNumber: string, reference: string | null, ip?: string) {
    const so = await this.prisma.shopOrder.findFirst({ where: { number: shopOrderNumber, ...this.refundWhere('due') }, select: this.refundSelect });
    if (!so) throw new NotFoundException('No refund to make for this order');
    const payment = so.payments[0];
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED', refundedAt: now, refundRef: reference } });
      await this.notifications.send(
        tx,
        so.order.customer.id,
        'ORDER',
        {
          lo: { title: `ຄືນເງິນແລ້ວ ${so.number}`, body: `Taladonline ໂອນຄືນ ${formatMoney(num(payment.amount), 'lo')} ໃຫ້ທ່ານແລ້ວ.` },
          en: { title: `Refunded ${so.number}`, body: `Taladonline sent ${formatMoney(num(payment.amount), 'en')} back to you.` },
        },
        { link: `/account/orders/${so.number}` },
      );
      await this.audit.log({ adminId: admin.id, action: 'refund.paid', entityType: 'ShopOrder', entityId: so.id, changes: { number: so.number, reference }, ip }, tx);
    });
    return { ok: true };
  }

  /** The QR of the customer's refund account, if they saved one. */
  async refundQr(bankAccountId: string) {
    const account = await this.prisma.customerBankAccount.findUnique({ where: { id: bankAccountId }, select: { qrImageKey: true } });
    if (!account?.qrImageKey) throw new NotFoundException('No QR');
    return this.storage.get(account.qrImageKey);
  }

  private refundWhere(queue: RefundQueue): Prisma.ShopOrderWhereInput {
    const transfer = { method: { not: 'COD' as const } };
    return queue === 'due'
      ? { status: 'CANCELLED', payments: { some: { ...transfer, status: 'PAID', amount: { gt: 0 } } } }
      : { payments: { some: { ...transfer, status: 'REFUNDED', refundedAt: { not: null } } } };
  }

  private readonly refundSelect = {
    id: true,
    number: true,
    cancelReason: true,
    updatedAt: true,
    shop: { select: { name: true } },
    order: { select: { number: true, customer: { select: { id: true, name: true, phone: true } } } },
    payments: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, amount: true, status: true, refundedAt: true, refundRef: true } },
  } satisfies Prisma.ShopOrderSelect;

  private async refundView(r: Prisma.ShopOrderGetPayload<{ select: PaymentReviewService['refundSelect'] }>) {
    const account = await this.prisma.customerBankAccount.findFirst({
      where: { customerId: r.order.customer.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: { id: true, bankCode: true, accountName: true, accountNumber: true, qrImageKey: true },
    });
    const p = r.payments[0];
    return {
      number: r.number,
      orderNumber: r.order.number,
      shop: r.shop.name,
      customer: r.order.customer,
      reason: r.cancelReason,
      cancelledAt: r.updatedAt,
      amount: num(p?.amount),
      refundedAt: p?.refundedAt ?? null,
      reference: p?.refundRef ?? null,
      refundAccount: account && { id: account.id, bankCode: account.bankCode, accountName: account.accountName, accountNumber: account.accountNumber, hasQr: !!account.qrImageKey },
    };
  }

  private async find(number: string): Promise<OrderRow> {
    const o = await this.prisma.order.findFirst({ where: { number }, include: orderInclude });
    if (!o) throw new NotFoundException('Order not found');
    return o;
  }

  private view(o: OrderRow) {
    const state = (s: SlipStatus) => o.slips.filter((x) => x.status === s).length;
    return {
      number: o.number,
      createdAt: o.createdAt,
      total: num(o.grandTotal),
      customer: o.customer,
      shopOrders: o.shopOrders.map((so) => ({
        number: so.number,
        status: so.status,
        total: num(so.total),
        shop: so.shop.name,
        paymentDueAt: so.paymentDueAt,
        payment: so.payments[0] && { method: so.payments[0].method, status: so.payments[0].status },
      })),
      slips: o.slips.map((s) => ({ id: s.id, status: s.status, rejectReason: s.rejectReason, createdAt: s.createdAt, reviewedAt: s.reviewedAt })),
      pending: state('PENDING'),
      lastSlipAt: o.slips[0]?.createdAt ?? null,
    };
  }
}

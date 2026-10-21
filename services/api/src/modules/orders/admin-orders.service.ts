import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUser, DisputeStatus, PayoutStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../media/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addSold, awardPoints, moveOrder, restoreStock } from './order-transitions.js';
import { shopNet } from './checkout-pricing.js';
import { paymentOf } from './payment-slips.service.js';

export type DisputeDecision = 'review' | 'refund' | 'reject';
export type PayoutAction = 'processing' | 'paid' | 'failed';

const num = (d: Prisma.Decimal | null | undefined) => d?.toNumber() ?? 0;
const pages = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

/** Disputes & refunds (§2.10) and shop payouts (§2.3) for the admin console. */
@Injectable()
export class AdminOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly storage: StorageService,
  ) {}

  // ─── Disputes ──────────────────────────────────────────────────────────────

  async disputes(filter: { status?: DisputeStatus; page: number; pageSize: number }) {
    const where: Prisma.DisputeWhereInput = filter.status ? { status: filter.status } : {};
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.dispute.findMany({
        where,
        orderBy: [{ createdAt: filter.status === 'OPEN' ? 'asc' : 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: {
          shopOrder: {
            select: {
              number: true,
              status: true,
              total: true,
              shop: { select: { id: true, name: true } },
              order: { select: { customer: { select: { id: true, name: true, phone: true } } } },
            },
          },
        },
      }),
      this.prisma.dispute.count({ where }),
      this.prisma.dispute.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      items: rows.map((d) => ({
        id: d.id,
        status: d.status,
        raisedBy: d.raisedBy,
        reason: d.reason,
        details: d.details,
        refundAmount: d.refundAmount?.toNumber() ?? null,
        resolution: d.resolution,
        resolvedAt: d.resolvedAt,
        createdAt: d.createdAt,
        order: {
          number: d.shopOrder.number,
          status: d.shopOrder.status,
          total: num(d.shopOrder.total),
          shop: d.shopOrder.shop,
          customer: d.shopOrder.order.customer,
        },
      })),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      totalPages: pages(total, filter.pageSize),
      counts: Object.fromEntries(byStatus.map((g) => [g.status, g._count._all])),
    };
  }

  /**
   * review → in review; refund → order cancelled and refunded (stock back);
   * reject → the return is closed and the order completes.
   */
  async decideDispute(admin: AdminUser, id: string, decision: DisputeDecision, resolution: string | null, ip?: string) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id },
      include: {
        shopOrder: {
          include: {
            payments: { orderBy: { createdAt: 'desc' }, take: 1 },
            shop: { select: { name: true, ownerId: true } },
            order: { select: { customerId: true, shopOrders: { select: { id: true } }, payments: { where: { shopOrderId: null }, take: 1 } } },
            items: { take: 1, select: { product: { select: { images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } } } } },
          },
        },
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    const open = dispute.status === 'OPEN' || dispute.status === 'IN_REVIEW';
    if (!open || (decision === 'review' && dispute.status !== 'OPEN')) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'This dispute is already handled' });
    }
    if (decision !== 'review' && !resolution) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Write the resolution for both sides' });
    }
    const so = dispute.shopOrder;
    const target = { customerId: so.order.customerId, number: so.number, shopName: so.shop.name, imageKey: so.items[0]?.product.images[0]?.key };
    const actor = { actorType: 'ADMIN' as const, actorId: admin.id };

    await this.prisma.$transaction(async (tx) => {
      if (decision === 'review') {
        await tx.dispute.update({ where: { id }, data: { status: 'IN_REVIEW' } });
      } else if (decision === 'refund') {
        await tx.dispute.update({
          where: { id },
          data: { status: 'RESOLVED_REFUND', resolution, refundAmount: so.total, resolvedById: admin.id, resolvedAt: new Date() },
        });
        if (so.status !== 'CANCELLED' && (await moveOrder(tx, so.id, so.status, 'CANCELLED', { cancelReason: resolution }, { ...actor, note: resolution }))) {
          await restoreStock(tx, so.id);
        }
        const payment = paymentOf(so);
        if (payment) await tx.payment.update({ where: { id: payment.id }, data: { status: 'REFUNDED' } });
        await this.notifications.notifyOrder(tx, target, 'CANCELLED', resolution);
      } else {
        await tx.dispute.update({
          where: { id },
          data: { status: 'RESOLVED_REJECTED', resolution, resolvedById: admin.id, resolvedAt: new Date() },
        });
        if (so.status === 'RETURN_REQUESTED' && (await moveOrder(tx, so.id, 'RETURN_REQUESTED', 'COMPLETED', {}, { ...actor, note: resolution }))) {
          await addSold(tx, so.id);
          await awardPoints(tx, so.id);
        }
        await this.notifications.notifyOrder(tx, target, 'COMPLETED', null);
      }
      if (decision !== 'review' && so.shop.ownerId) {
        const refunded = decision === 'refund';
        await this.notifications.send(tx, so.shop.ownerId, 'SYSTEM', {
          lo: { title: refunded ? 'Taladonline ອະນຸມັດການຄືນເງິນ' : 'Taladonline ປະຕິເສດການຄືນສິນຄ້າ', body: `${so.number}: ${resolution}` },
          en: { title: refunded ? 'Taladonline approved a refund' : 'Taladonline rejected a return', body: `${so.number}: ${resolution}` },
        }, { link: `/orders/${so.number}` });
      }
      await this.audit.log({ adminId: admin.id, action: `dispute.${decision}`, entityType: 'Dispute', entityId: id, changes: { order: so.number, resolution }, ip }, tx);
    });
    const updated = await this.prisma.dispute.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, resolution: true } });
    return updated;
  }

  // ─── Payouts ───────────────────────────────────────────────────────────────

  async payouts(filter: { status?: PayoutStatus; shopId?: string; page: number; pageSize: number }) {
    const where: Prisma.PayoutWhereInput = { ...(filter.status && { status: filter.status }), ...(filter.shopId && { shopId: filter.shopId }) };
    const [rows, total, byStatus, unsettled] = await Promise.all([
      this.prisma.payout.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: {
          shop: { select: { id: true, name: true, paymentBankCode: true, paymentAccountName: true, paymentAccountNumber: true } },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.payout.count({ where }),
      this.prisma.payout.groupBy({ by: ['status'], _count: { _all: true }, _sum: { netAmount: true } }),
      this.prisma.shopOrder.aggregate({
        where: { status: 'COMPLETED', payoutId: null },
        _count: { _all: true },
        _sum: { total: true, commissionAmount: true, platformDiscount: true },
      }),
    ]);
    return {
      items: rows.map((p) => ({
        id: p.id,
        shop: p.shop,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        gross: num(p.grossAmount),
        commission: num(p.commissionAmount),
        refunds: num(p.refundAmount),
        net: num(p.netAmount),
        status: p.status,
        paidAt: p.paidAt,
        reference: p.reference,
        orderCount: p._count.orders,
        createdAt: p.createdAt,
      })),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      totalPages: pages(total, filter.pageSize),
      totals: Object.fromEntries(byStatus.map((g) => [g.status, { count: g._count._all, net: num(g._sum.netAmount) }])),
      /** Completed orders not yet in any payout: what "Generate" would settle. */
      unsettled: {
        orders: unsettled._count._all,
        net: shopNet({ total: num(unsettled._sum.total), platformDiscount: num(unsettled._sum.platformDiscount), commission: num(unsettled._sum.commissionAmount) }),
      },
    };
  }

  /** One scheduled payout per shop for its completed orders not yet paid out. */
  async generatePayouts(admin: AdminUser, ip?: string): Promise<{ created: number }> {
    const cutoff = new Date();
    const orders = await this.prisma.shopOrder.findMany({
      where: { status: 'COMPLETED', payoutId: null, updatedAt: { lte: cutoff } },
      select: { id: true, shopId: true, total: true, platformDiscount: true, commissionAmount: true, createdAt: true },
    });
    const byShop = new Map<string, typeof orders>();
    for (const o of orders) byShop.set(o.shopId, [...(byShop.get(o.shopId) ?? []), o]);

    let created = 0;
    for (const [shopId, list] of byShop) {
      // What customers paid plus platform coupons Taladonline pays back (shopNet = gross − commission).
      const gross = list.reduce((s, o) => s + num(o.total) + num(o.platformDiscount), 0);
      const commission = list.reduce((s, o) => s + num(o.commissionAmount), 0);
      await this.prisma.$transaction(async (tx) => {
        const payout = await tx.payout.create({
          data: {
            shopId,
            periodStart: new Date(Math.min(...list.map((o) => o.createdAt.getTime()))),
            periodEnd: cutoff,
            grossAmount: gross,
            commissionAmount: commission,
            netAmount: gross - commission,
            status: 'SCHEDULED',
          },
        });
        // Only orders still unclaimed (a concurrent run can't settle them twice).
        await tx.shopOrder.updateMany({ where: { id: { in: list.map((o) => o.id) }, payoutId: null }, data: { payoutId: payout.id } });
        await this.audit.log({ adminId: admin.id, action: 'payout.create', entityType: 'Payout', entityId: payout.id, changes: { shopId, orders: list.length, net: gross - commission }, ip }, tx);
      });
      created++;
    }
    return { created };
  }

  /** One payout with where to send it (bank account, QR) and the orders it settles. */
  async payoutDetail(id: string) {
    const p = await this.prisma.payout.findUnique({
      where: { id },
      include: {
        shop: {
          select: { id: true, name: true, phone: true, paymentBankCode: true, paymentAccountName: true, paymentAccountNumber: true, paymentQrKey: true },
        },
        orders: {
          orderBy: { createdAt: 'asc' },
          select: { number: true, createdAt: true, updatedAt: true, subtotal: true, discountTotal: true, platformDiscount: true, total: true, commissionAmount: true },
        },
      },
    });
    if (!p) throw new NotFoundException('Payout not found');
    const { paymentQrKey, ...shop } = p.shop;
    return {
      id: p.id,
      shop: { ...shop, hasQr: paymentQrKey !== null },
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      gross: num(p.grossAmount),
      commission: num(p.commissionAmount),
      refunds: num(p.refundAmount),
      net: num(p.netAmount),
      status: p.status,
      paidAt: p.paidAt,
      reference: p.reference,
      createdAt: p.createdAt,
      orders: p.orders.map((o) => {
        const total = num(o.total);
        const platformDiscount = num(o.platformDiscount);
        const commission = num(o.commissionAmount);
        return {
          number: o.number,
          placedAt: o.createdAt,
          completedAt: o.updatedAt,
          subtotal: num(o.subtotal),
          discount: num(o.discountTotal),
          platformDiscount,
          total,
          commission,
          net: shopNet({ total, platformDiscount, commission }),
        };
      }),
    };
  }

  /** The shop's payment QR (private), to pay a payout by scanning it. */
  async payoutQr(id: string) {
    const p = await this.prisma.payout.findUnique({ where: { id }, select: { shop: { select: { paymentQrKey: true } } } });
    if (!p?.shop.paymentQrKey) throw new NotFoundException('No payment QR');
    return this.storage.get(p.shop.paymentQrKey);
  }

  async updatePayout(admin: AdminUser, id: string, action: PayoutAction, reference: string | null, ip?: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id }, include: { shop: { select: { ownerId: true } } } });
    if (!payout) throw new NotFoundException('Payout not found');
    const allowed: Record<PayoutAction, PayoutStatus[]> = {
      processing: ['SCHEDULED'],
      paid: ['SCHEDULED', 'PROCESSING'],
      failed: ['SCHEDULED', 'PROCESSING'],
    };
    if (!allowed[action].includes(payout.status)) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: 'This payout is already settled' });
    }
    if (action === 'paid' && !reference) throw new BadRequestException({ code: 'REFERENCE_REQUIRED', message: 'Enter the bank transfer reference' });

    const status: PayoutStatus = action === 'processing' ? 'PROCESSING' : action === 'paid' ? 'PAID' : 'FAILED';
    await this.prisma.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id },
        data: { status, ...(action === 'paid' && { paidAt: new Date(), reference }), ...(action === 'failed' && { reference }) },
      });
      // A failed transfer releases its orders for the next payout run.
      if (action === 'failed') await tx.shopOrder.updateMany({ where: { payoutId: id }, data: { payoutId: null } });
      if (action === 'paid' && payout.shop.ownerId) {
        const amount = `₭${num(payout.netAmount).toLocaleString('en-US')}`;
        await this.notifications.send(tx, payout.shop.ownerId, 'SYSTEM', {
          lo: { title: 'ໂອນເງິນໃຫ້ຮ້ານແລ້ວ', body: `Taladonline ໂອນ ${amount} ເຂົ້າບັນຊີຂອງທ່ານແລ້ວ (ອ້າງອີງ ${reference}).` },
          en: { title: 'Payout sent', body: `Taladonline paid ${amount} to your account (ref. ${reference}).` },
        }, { link: '/finance' });
      }
      await this.audit.log({ adminId: admin.id, action: `payout.${action}`, entityType: 'Payout', entityId: id, changes: { from: payout.status, to: status, reference }, ip }, tx);
    });
    return { id, status };
  }
}

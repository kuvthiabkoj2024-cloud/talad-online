import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const DAY = 86_400_000;
const toDay = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const num = (v: Prisma.Decimal | number | bigint | null | undefined) => (v === null || v === undefined ? 0 : Number(v));
/** Orders that count as sales: everything but cancellations. */
const COUNTED = Prisma.sql`so.status <> 'CANCELLED'`;

export type SalesGroup = 'shop' | 'category' | 'product';

/** Platform dashboard (§2.2) and reports (§2.9). */
@Injectable()
export class AdminReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(days: number, now = new Date()) {
    const end = new Date(`${toDay(now)}T00:00:00+07:00`).getTime() + DAY;
    const from = new Date(end - days * DAY);
    const prevFrom = new Date(from.getTime() - days * DAY);
    const to = new Date(end);
    const inRange = (a: Date, b: Date) => Prisma.sql`so."createdAt" >= ${a} AND so."createdAt" < ${b}`;

    const [totals, prev, refunds, daily, signups, activeShops, activeCustomers, topShops, topCategories, topProducts, alerts] = await Promise.all([
      this.prisma.$queryRaw<{ orders: number; gmv: Prisma.Decimal | null; commission: Prisma.Decimal | null }[]>`
        SELECT COUNT(*)::int AS orders, SUM(so.total) AS gmv, SUM(so."commissionAmount") AS commission
        FROM "ShopOrder" so WHERE ${COUNTED} AND ${inRange(from, to)}`,
      this.prisma.$queryRaw<{ orders: number; gmv: Prisma.Decimal | null }[]>`
        SELECT COUNT(*)::int AS orders, SUM(so.total) AS gmv FROM "ShopOrder" so WHERE ${COUNTED} AND ${inRange(prevFrom, from)}`,
      this.prisma.$queryRaw<{ all: number; refunded: number }[]>`
        SELECT COUNT(*)::int AS all,
               COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Payment" p WHERE p."shopOrderId" = so.id AND p.status = 'REFUNDED'))::int AS refunded
        FROM "ShopOrder" so WHERE ${inRange(from, to)}`,
      this.prisma.$queryRaw<{ day: Date; orders: number; gmv: Prisma.Decimal | null }[]>`
        SELECT (so."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Vientiane')::date AS day, COUNT(*)::int AS orders, SUM(so.total) AS gmv
        FROM "ShopOrder" so WHERE ${COUNTED} AND ${inRange(from, to)} GROUP BY 1`,
      this.prisma.customer.count({ where: { createdAt: { gte: from, lt: to } } }),
      this.prisma.shop.count({ where: { status: 'APPROVED' } }),
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(DISTINCT o."customerId")::int AS n FROM "ShopOrder" so JOIN "Order" o ON o.id = so."orderId"
        WHERE ${COUNTED} AND ${inRange(from, to)}`,
      this.top('shop', from, to, 5),
      this.top('category', from, to, 5),
      this.top('product', from, to, 5),
      this.alerts(),
    ]);

    const byDay = new Map(daily.map((d) => [new Date(d.day).toISOString().slice(0, 10), d]));
    const series = Array.from({ length: days }, (_, i) => {
      const date = toDay(new Date(from.getTime() + i * DAY));
      const d = byDay.get(date);
      return { date, orders: d?.orders ?? 0, gmv: num(d?.gmv) };
    });
    return {
      days,
      kpis: {
        gmv: num(totals[0]?.gmv),
        orders: totals[0]?.orders ?? 0,
        commission: num(totals[0]?.commission),
        activeShops,
        activeCustomers: activeCustomers[0]?.n ?? 0,
        newSignups: signups,
        refundRate: refunds[0]?.all ? Math.round((refunds[0].refunded / refunds[0].all) * 1000) / 10 : 0,
      },
      previous: { gmv: num(prev[0]?.gmv), orders: prev[0]?.orders ?? 0 },
      series,
      top: { shops: topShops, categories: topCategories, products: topProducts },
      alerts,
    };
  }

  /** What needs staff attention right now (§2.2 alerts). */
  async alerts() {
    const [pendingShops, pendingProducts, openDisputes, lowStock, scheduled, unsettled] = await Promise.all([
      this.prisma.shop.count({ where: { status: 'PENDING' } }),
      this.prisma.product.count({ where: { status: 'PENDING' } }),
      this.prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(*)::int AS n FROM "Product" p
        WHERE p.status = 'PUBLISHED' AND COALESCE((SELECT SUM(v.stock) FROM "ProductVariant" v WHERE v."productId" = p.id), p.stock) <= p."lowStockThreshold"`,
      this.prisma.payout.aggregate({ where: { status: { in: ['SCHEDULED', 'PROCESSING'] } }, _count: { _all: true }, _sum: { netAmount: true } }),
      this.prisma.shopOrder.count({ where: { status: 'COMPLETED', payoutId: null } }),
    ]);
    return {
      pendingShops,
      pendingProducts,
      openDisputes,
      lowStock: lowStock[0]?.n ?? 0,
      payoutsDue: { count: scheduled._count._all, net: num(scheduled._sum.netAmount) },
      unsettledOrders: unsettled,
    };
  }

  /** Sales grouped by shop, category or product, best first. */
  async top(group: SalesGroup, from: Date, to: Date, limit = 100) {
    const key =
      group === 'shop'
        ? Prisma.sql`s.id AS id, s.name AS name`
        : group === 'category'
          ? Prisma.sql`c.id AS id, COALESCE(c.name->>'en', c.name->>'lo') AS name`
          : Prisma.sql`p.id AS id, p.name AS name`;
    const rows = await this.prisma.$queryRaw<{ id: string; name: string; orders: number; units: number; revenue: Prisma.Decimal; commission: Prisma.Decimal | null }[]>`
      SELECT ${key},
             COUNT(DISTINCT so.id)::int AS orders,
             SUM(oi.quantity)::int AS units,
             SUM(oi."lineTotal") AS revenue,
             SUM(oi."lineTotal" * COALESCE(so."commissionAmount" / NULLIF(so.subtotal, 0), 0)) AS commission
      FROM "OrderItem" oi
      JOIN "ShopOrder" so ON so.id = oi."shopOrderId"
      JOIN "Shop" s ON s.id = so."shopId"
      JOIN "Product" p ON p.id = oi."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE ${COUNTED} AND so."createdAt" >= ${from} AND so."createdAt" < ${to}
      GROUP BY 1, 2
      ORDER BY revenue DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({ id: r.id, name: r.name, orders: r.orders, units: r.units, revenue: num(r.revenue), commission: Math.round(num(r.commission)) }));
  }

  /** Money in and out for the period (§2.9 financial). */
  async finance(from: Date, to: Date) {
    const [gross, completed, refunded, payouts] = await Promise.all([
      this.prisma.shopOrder.aggregate({ where: { status: { not: 'CANCELLED' }, createdAt: { gte: from, lt: to } }, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.shopOrder.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: from, lt: to } }, _sum: { total: true, commissionAmount: true } }),
      this.prisma.shopOrder.aggregate({
        where: { createdAt: { gte: from, lt: to }, payments: { some: { status: 'REFUNDED' } } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      this.prisma.payout.aggregate({ where: { status: 'PAID', paidAt: { gte: from, lt: to } }, _sum: { netAmount: true }, _count: { _all: true } }),
    ]);
    return {
      gmv: num(gross._sum.total),
      orders: gross._count._all,
      completedSales: num(completed._sum.total),
      commissionCollected: num(completed._sum.commissionAmount),
      refundsIssued: { count: refunded._count._all, amount: num(refunded._sum.total) },
      payoutsPaid: { count: payouts._count._all, amount: num(payouts._sum.netAmount) },
    };
  }

  /** New customers and how many came back (§2.9 acquisition & retention). */
  async customers(from: Date, to: Date) {
    const [signups, buyers] = await Promise.all([
      this.prisma.customer.count({ where: { createdAt: { gte: from, lt: to } } }),
      this.prisma.$queryRaw<{ buyers: number; repeat: number; first: number }[]>`
        WITH b AS (
          SELECT o."customerId" AS id, COUNT(DISTINCT so.id) AS n,
                 MIN(so."createdAt") >= ${from} AS first_time
          FROM "ShopOrder" so JOIN "Order" o ON o.id = so."orderId"
          WHERE ${COUNTED} AND so."createdAt" < ${to}
          GROUP BY 1
          HAVING MAX(so."createdAt") >= ${from}
        )
        SELECT COUNT(*)::int AS buyers, COUNT(*) FILTER (WHERE n > 1)::int AS repeat, COUNT(*) FILTER (WHERE first_time)::int AS first FROM b`,
    ]);
    const b = buyers[0] ?? { buyers: 0, repeat: 0, first: 0 };
    return {
      signups,
      buyers: b.buyers,
      firstTimeBuyers: b.first,
      repeatBuyers: b.repeat,
      repeatRate: b.buyers ? Math.round((b.repeat / b.buyers) * 1000) / 10 : 0,
    };
  }

  async salesCsv(group: SalesGroup, from: Date, to: Date): Promise<string> {
    const rows = await this.top(group, from, to, 10_000);
    const cell = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [group[0].toUpperCase() + group.slice(1), 'Orders', 'Units', 'Revenue', 'Commission'];
    return '﻿' + [header.join(','), ...rows.map((r) => [r.name, r.orders, r.units, r.revenue, r.commission].map(cell).join(','))].join('\n') + '\n';
  }
}

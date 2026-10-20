import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';

const DAY = 86_400_000;
export const STATS_RANGES = [7, 30, 90] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

/** Local calendar day in Laos for a UTC timestamp column. */
const LOCAL_DAY = Prisma.sql`(so."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Vientiane')::date`;
const toDay = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
const num = (v: Prisma.Decimal | number | bigint | null | undefined) => (v === null || v === undefined ? 0 : Number(v));

export interface ShopFinance {
  from: Date;
  to: Date;
  /** Completed orders in the period: what the shop has earned. */
  earned: { orders: number; gross: number; commission: number; net: number };
  /** Paid or cash orders still on their way to the customer. */
  inProgress: { orders: number; amount: number };
  refunded: { orders: number; amount: number };
  /** All-time completed net minus payouts already paid. */
  balance: number;
  payouts: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    gross: number;
    commission: number;
    refunds: number;
    net: number;
    status: string;
    paidAt: Date | null;
    reference: string | null;
  }[];
}

export interface ShopStats {
  days: StatsRange;
  series: { date: string; orders: number; revenue: number }[];
  /** The period before, day by day (same length, oldest first), for the comparison line. */
  previousSeries: { date: string; orders: number; revenue: number }[];
  totals: { orders: number; revenue: number; customers: number; averageOrder: number; units: number };
  previous: { orders: number; revenue: number; customers: number; averageOrder: number; units: number };
  /** Orders and revenue by how customers paid. */
  payments: { method: string; orders: number; revenue: number }[];
  topProducts: { productId: string; name: string; imageUrl: string | null; units: number; revenue: number }[];
  statusCounts: Record<string, number>;
  productViews: number;
}

/** Shop money and sales reports (§3.7). */
@Injectable()
export class ShopReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async finance(shopId: string, from: Date, to: Date): Promise<ShopFinance> {
    const inPeriod = { shopId, createdAt: { gte: from, lt: to } };
    const [earned, active, refunded, lifetime, payouts] = await Promise.all([
      this.prisma.shopOrder.aggregate({
        where: { ...inPeriod, status: 'COMPLETED' },
        _count: { _all: true },
        _sum: { total: true, commissionAmount: true },
      }),
      this.prisma.shopOrder.aggregate({
        where: { ...inPeriod, status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.shopOrder.aggregate({
        where: { ...inPeriod, status: 'CANCELLED', payments: { some: { status: 'REFUNDED' } } },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.prisma.shopOrder.aggregate({ where: { shopId, status: 'COMPLETED' }, _sum: { total: true, commissionAmount: true } }),
      this.prisma.payout.findMany({ where: { shopId }, orderBy: { periodStart: 'desc' }, take: 24 }),
    ]);
    const gross = num(earned._sum.total);
    const commission = num(earned._sum.commissionAmount);
    const paidOut = payouts.filter((p) => p.status === 'PAID').reduce((s, p) => s + num(p.netAmount), 0);
    return {
      from,
      to,
      earned: { orders: earned._count._all, gross, commission, net: gross - commission },
      inProgress: { orders: active._count._all, amount: num(active._sum.total) },
      refunded: { orders: refunded._count._all, amount: num(refunded._sum.total) },
      balance: num(lifetime._sum.total) - num(lifetime._sum.commissionAmount) - paidOut,
      payouts: payouts.map((p) => ({
        id: p.id,
        periodStart: p.periodStart,
        periodEnd: p.periodEnd,
        gross: num(p.grossAmount),
        commission: num(p.commissionAmount),
        refunds: num(p.refundAmount),
        net: num(p.netAmount),
        status: p.status,
        paidAt: p.paidAt,
        reference: p.reference,
      })),
    };
  }

  /** Orders in the period as CSV (for accounting): one row per shop order. */
  async statement(shopId: string, from: Date, to: Date): Promise<string> {
    const rows = await this.prisma.shopOrder.findMany({
      where: { shopId, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: 'asc' },
      select: {
        number: true,
        createdAt: true,
        status: true,
        subtotal: true,
        discountTotal: true,
        total: true,
        commissionAmount: true,
        payments: { take: 1, orderBy: { createdAt: 'desc' }, select: { method: true, status: true } },
        // Older single-shop checkouts keep the payment on the order.
        order: { select: { payments: { where: { shopOrderId: null }, take: 1, select: { method: true, status: true } } } },
      },
    });
    const cell = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Date', 'Order', 'Status', 'Payment', 'Payment status', 'Subtotal', 'Discount', 'Total', 'Commission', 'Net'];
    const lines = rows.map((r) => {
      const total = num(r.total);
      const commission = r.status === 'CANCELLED' ? 0 : num(r.commissionAmount);
      const payment = r.payments[0] ?? r.order.payments[0];
      return [
        toDay(r.createdAt),
        r.number,
        r.status,
        payment?.method ?? '',
        payment?.status ?? '',
        num(r.subtotal),
        num(r.discountTotal),
        total,
        commission,
        r.status === 'CANCELLED' ? 0 : total - commission,
      ]
        .map(cell)
        .join(',');
    });
    // BOM so Excel opens it as UTF-8.
    return '﻿' + [header.join(','), ...lines].join('\n') + '\n';
  }

  async stats(shopId: string, days: StatsRange, now = new Date()): Promise<ShopStats> {
    const end = new Date(`${toDay(now)}T00:00:00+07:00`).getTime() + DAY; // end of today, Laos time
    const from = new Date(end - days * DAY);
    const prevFrom = new Date(from.getTime() - days * DAY);
    const counted = Prisma.sql`so."shopId" = ${shopId} AND so.status <> 'CANCELLED'`;

    const [daily, prevDaily, customers, prevCustomers, top, units, prevUnits, statuses, views, payments] = await Promise.all([
      this.prisma.$queryRaw<{ day: Date; orders: number; revenue: Prisma.Decimal | null }[]>`
        SELECT ${LOCAL_DAY} AS day, COUNT(*)::int AS orders, SUM(so.total) AS revenue
        FROM "ShopOrder" so
        WHERE ${counted} AND so."createdAt" >= ${from} AND so."createdAt" < ${new Date(end)}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ day: Date; orders: number; revenue: Prisma.Decimal | null }[]>`
        SELECT ${LOCAL_DAY} AS day, COUNT(*)::int AS orders, SUM(so.total) AS revenue
        FROM "ShopOrder" so
        WHERE ${counted} AND so."createdAt" >= ${prevFrom} AND so."createdAt" < ${from}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(DISTINCT o."customerId")::int AS n
        FROM "ShopOrder" so JOIN "Order" o ON o.id = so."orderId"
        WHERE ${counted} AND so."createdAt" >= ${from} AND so."createdAt" < ${new Date(end)}`,
      this.prisma.$queryRaw<{ n: number }[]>`
        SELECT COUNT(DISTINCT o."customerId")::int AS n
        FROM "ShopOrder" so JOIN "Order" o ON o.id = so."orderId"
        WHERE ${counted} AND so."createdAt" >= ${prevFrom} AND so."createdAt" < ${from}`,
      this.prisma.$queryRaw<{ productId: string; units: number; revenue: Prisma.Decimal }[]>`
        SELECT oi."productId", SUM(oi.quantity)::int AS units, SUM(oi."lineTotal") AS revenue
        FROM "OrderItem" oi JOIN "ShopOrder" so ON so.id = oi."shopOrderId"
        WHERE ${counted} AND so."createdAt" >= ${from} AND so."createdAt" < ${new Date(end)}
        GROUP BY oi."productId"
        ORDER BY revenue DESC
        LIMIT 5`,
      this.prisma.$queryRaw<{ n: number | null }[]>`
        SELECT SUM(oi.quantity)::int AS n
        FROM "OrderItem" oi JOIN "ShopOrder" so ON so.id = oi."shopOrderId"
        WHERE ${counted} AND so."createdAt" >= ${from} AND so."createdAt" < ${new Date(end)}`,
      this.prisma.$queryRaw<{ n: number | null }[]>`
        SELECT SUM(oi.quantity)::int AS n
        FROM "OrderItem" oi JOIN "ShopOrder" so ON so.id = oi."shopOrderId"
        WHERE ${counted} AND so."createdAt" >= ${prevFrom} AND so."createdAt" < ${from}`,
      this.prisma.shopOrder.groupBy({ by: ['status'], where: { shopId, createdAt: { gte: from } }, _count: { _all: true } }),
      this.prisma.product.aggregate({ where: { shopId }, _sum: { viewCount: true } }),
      this.prisma.$queryRaw<{ method: string; orders: number; revenue: Prisma.Decimal | null }[]>`
        -- The shop order's own payment, or (older checkouts) the order-level one, as paymentOf().
        SELECT COALESCE(sp.method, op.method)::text AS method, COUNT(*)::int AS orders, SUM(so.total) AS revenue
        FROM "ShopOrder" so
        LEFT JOIN LATERAL (SELECT method FROM "Payment" WHERE "shopOrderId" = so.id ORDER BY "createdAt" DESC LIMIT 1) sp ON true
        LEFT JOIN LATERAL (SELECT method FROM "Payment" WHERE "orderId" = so."orderId" AND "shopOrderId" IS NULL ORDER BY "createdAt" DESC LIMIT 1) op ON true
        WHERE ${counted} AND so."createdAt" >= ${from} AND so."createdAt" < ${new Date(end)} AND COALESCE(sp.method, op.method) IS NOT NULL
        GROUP BY 1
        ORDER BY revenue DESC`,
    ]);

    const days_ = (rows: typeof daily, start: Date) => {
      const byDay = new Map(rows.map((d) => [new Date(d.day).toISOString().slice(0, 10), d]));
      return Array.from({ length: days }, (_, i) => {
        const date = toDay(new Date(start.getTime() + i * DAY));
        const d = byDay.get(date);
        return { date, orders: d?.orders ?? 0, revenue: num(d?.revenue) };
      });
    };
    const series = days_(daily, from);
    const previousSeries = days_(prevDaily, prevFrom);
    const prevOrders = previousSeries.reduce((s, d) => s + d.orders, 0);
    const prevRevenue = previousSeries.reduce((s, d) => s + d.revenue, 0);
    const products = await this.prisma.product.findMany({
      where: { id: { in: top.map((t) => t.productId) } },
      select: { id: true, name: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } },
    });
    const productById = new Map(products.map((p) => [p.id, p]));
    const orders = series.reduce((s, d) => s + d.orders, 0);
    const revenue = series.reduce((s, d) => s + d.revenue, 0);

    return {
      days,
      series,
      previousSeries,
      totals: {
        orders,
        revenue,
        customers: customers[0]?.n ?? 0,
        averageOrder: orders ? Math.round(revenue / orders) : 0,
        units: units[0]?.n ?? 0,
      },
      previous: {
        orders: prevOrders,
        revenue: prevRevenue,
        customers: prevCustomers[0]?.n ?? 0,
        averageOrder: prevOrders ? Math.round(prevRevenue / prevOrders) : 0,
        units: prevUnits[0]?.n ?? 0,
      },
      payments: payments.map((p) => ({ method: p.method, orders: p.orders, revenue: num(p.revenue) })),
      topProducts: top.map((t) => {
        const p = productById.get(t.productId);
        return {
          productId: t.productId,
          name: p?.name ?? '—',
          imageUrl: p?.images[0] ? this.media.publicUrl(p.images[0].key) : null,
          units: t.units,
          revenue: num(t.revenue),
        };
      }),
      statusCounts: Object.fromEntries(statuses.map((s) => [s.status, s._count._all])),
      productViews: num(views._sum.viewCount),
    };
  }
}

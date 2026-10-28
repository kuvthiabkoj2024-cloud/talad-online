import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { StorageService } from '../media/storage.service.js';
import { shopNet } from '../orders/checkout-pricing.js';

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
  /**
   * `gross` = what customers paid + platform coupons Taladonline pays back; `net` = gross − commission.
   * `discounts`: what the shop's prices were lowered by — flash sales and its own coupons (both
   * the shop's cost) and platform coupons (funded by Taladonline, included in `gross`).
   */
  earned: {
    orders: number;
    gross: number;
    commission: number;
    net: number;
    discounts: { flashSale: number; shopCoupons: number; platformCoupons: number };
  };
  /** Paid or cash orders still on their way to the customer. */
  inProgress: { orders: number; amount: number };
  refunded: { orders: number; amount: number };
  /** All-time completed net (transfers only) minus payouts already paid. */
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
    private readonly storage: StorageService,
  ) {}

  /** Taladonline's transfer slip for one of the shop's payouts. */
  async payoutSlip(shopId: string, id: string) {
    const p = await this.prisma.payout.findFirst({ where: { id, shopId }, select: { slipKey: true } });
    if (!p?.slipKey) throw new NotFoundException('No transfer slip');
    return this.storage.get(p.slipKey);
  }

  async finance(shopId: string, from: Date, to: Date): Promise<ShopFinance> {
    const inPeriod = { shopId, createdAt: { gte: from, lt: to } };
    const [earned, active, refunded, lifetime, payouts, flash] = await Promise.all([
      this.prisma.shopOrder.aggregate({
        where: { ...inPeriod, status: 'COMPLETED' },
        _count: { _all: true },
        _sum: { total: true, commissionAmount: true, discountTotal: true, platformDiscount: true },
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
      // What Taladonline owes the shop: cash on delivery is already the shop's (it pays that commission monthly).
      this.prisma.shopOrder.aggregate({ where: { shopId, status: 'COMPLETED', payments: { none: { method: 'COD' } } }, _sum: { total: true, commissionAmount: true, platformDiscount: true } }),
      this.prisma.payout.findMany({ where: { shopId }, orderBy: { periodStart: 'desc' }, take: 24 }),
      // Flash-sale savings: regular price − sale price, per unit sold (unknown on older orders).
      this.prisma.$queryRaw<{ amount: Prisma.Decimal | null }[]>`
        SELECT SUM((COALESCE(oi."regularPrice", oi."unitPrice") - oi."unitPrice") * oi.quantity) AS amount
        FROM "OrderItem" oi JOIN "ShopOrder" so ON so.id = oi."shopOrderId"
        WHERE so."shopId" = ${shopId} AND so.status = 'COMPLETED' AND so."createdAt" >= ${from} AND so."createdAt" < ${to}`,
    ]);
    const platformCoupons = num(earned._sum.platformDiscount);
    const gross = num(earned._sum.total) + platformCoupons;
    const commission = num(earned._sum.commissionAmount);
    const paidOut = payouts.filter((p) => p.status === 'PAID').reduce((s, p) => s + num(p.netAmount), 0);
    return {
      from,
      to,
      earned: {
        orders: earned._count._all,
        gross,
        commission,
        net: gross - commission,
        discounts: { flashSale: num(flash[0]?.amount), shopCoupons: num(earned._sum.discountTotal) - platformCoupons, platformCoupons },
      },
      inProgress: { orders: active._count._all, amount: num(active._sum.total) },
      refunded: { orders: refunded._count._all, amount: num(refunded._sum.total) },
      balance: shopNet({ total: num(lifetime._sum.total), platformDiscount: num(lifetime._sum.platformDiscount), commission: num(lifetime._sum.commissionAmount) }) - paidOut,
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
        hasSlip: p.slipKey !== null,
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
        platformDiscount: true,
        total: true,
        commissionAmount: true,
        items: { select: { unitPrice: true, regularPrice: true, quantity: true } },
        payments: { take: 1, orderBy: { createdAt: 'desc' }, select: { method: true, status: true } },
        // Older single-shop checkouts keep the payment on the order.
        order: { select: { payments: { where: { shopOrderId: null }, take: 1, select: { method: true, status: true } } } },
      },
    });
    const cell = (v: string | number) => {
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      'Date', 'Order', 'Status', 'Payment', 'Payment status',
      'Regular price', 'Flash sale discount', 'Subtotal', 'Shop coupon', 'Platform coupon',
      'Customer paid', 'Commission', 'Net',
    ];
    const lines = rows.map((r) => {
      const total = num(r.total);
      const platform = num(r.platformDiscount);
      const cancelled = r.status === 'CANCELLED';
      const commission = cancelled ? 0 : num(r.commissionAmount);
      const regular = r.items.reduce((s, i) => s + num(i.regularPrice ?? i.unitPrice) * i.quantity, 0);
      const payment = r.payments[0] ?? r.order.payments[0];
      return [
        toDay(r.createdAt),
        r.number,
        r.status,
        payment?.method ?? '',
        payment?.status ?? '',
        regular,
        regular - num(r.subtotal),
        num(r.subtotal),
        num(r.discountTotal) - platform,
        platform,
        total,
        commission,
        cancelled ? 0 : shopNet({ total, platformDiscount: platform, commission }),
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

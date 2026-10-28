import { Injectable } from '@nestjs/common';
import type { PointTransactionType } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { pointRules } from '../orders/order-transitions.js';

const PAGE = 20;

export interface PointsView {
  balance: number;
  /** Kip one point is worth when spent at checkout (0 = spending is off). */
  pointValue: number;
  /** What the balance is worth now. */
  worth: number;
  /** Kip of an order per point earned (0 = earning is off). */
  earnPer: number;
  expiryDays: number | null;
  items: { id: string; type: PointTransactionType; points: number; note: string | null; orderNumber: string | null; expiresAt: Date | null; createdAt: Date }[];
  nextCursor: string | null;
}

/** A customer's loyalty points (§2.4, §4.6): balance, what it's worth, and the history. */
@Injectable()
export class PointsService {
  constructor(private readonly prisma: PrismaService) {}

  async mine(customerId: string, cursor?: string): Promise<PointsView> {
    const [customer, rules, rows] = await Promise.all([
      this.prisma.customer.findUnique({ where: { id: customerId }, select: { pointsBalance: true } }),
      pointRules(this.prisma),
      this.prisma.pointTransaction.findMany({
        where: { customerId },
        orderBy: { id: 'desc' },
        take: PAGE + 1,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      }),
    ]);
    const page = rows.slice(0, PAGE);
    const orders = await this.prisma.order.findMany({
      where: { id: { in: page.flatMap((r) => (r.orderId ? [r.orderId] : [])) } },
      select: { id: true, shopOrders: { orderBy: { number: 'asc' }, take: 1, select: { number: true } } },
    });
    const numberOf = new Map(orders.map((o) => [o.id, o.shopOrders[0]?.number ?? null]));
    const balance = Math.max(0, customer?.pointsBalance ?? 0);
    const pointValue = rules.redeemValue && rules.redeemValue > 0 ? rules.redeemValue : 0;
    return {
      balance,
      pointValue,
      worth: balance * pointValue,
      earnPer: rules.earnPer && rules.earnPer > 0 ? rules.earnPer : 0,
      expiryDays: rules.expiryDays ?? null,
      items: page.map((r) => ({
        id: r.id,
        type: r.type,
        points: r.points,
        note: r.note,
        orderNumber: r.orderId ? (numberOf.get(r.orderId) ?? null) : null,
        expiresAt: r.expiresAt,
        createdAt: r.createdAt,
      })),
      nextCursor: rows.length > PAGE ? page[page.length - 1].id : null,
    };
  }
}

import { RETURN_RULES, pointsForTotal, type PointTier } from '@talad/shared';
import type { ActorType, OrderStatus, Prisma } from '../../generated/prisma/client.js';

/** Puts a cancelled or returned order's units back on sale. */
export async function restoreStock(tx: Prisma.TransactionClient, shopOrderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { shopOrderId },
    select: { productId: true, variantId: true, quantity: true },
  });
  for (const i of items) {
    if (i.variantId) {
      await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.quantity } } });
    } else {
      await tx.product.update({ where: { id: i.productId }, data: { stock: { increment: i.quantity } } });
    }
  }
}

/**
 * The shop ran out although the listing still showed stock: what this order asked for is
 * gone, so it stops being sold until the shop updates the stock.
 */
export async function clearStock(tx: Prisma.TransactionClient, shopOrderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({ where: { shopOrderId }, select: { productId: true, variantId: true } });
  for (const i of items) {
    if (i.variantId) await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: 0 } });
    else await tx.product.update({ where: { id: i.productId }, data: { stock: 0 } });
  }
}

/**
 * A MC Mart message in the shop–customer chat (both sides see it, both get an unread),
 * creating the conversation if they never chatted.
 */
export async function postSystemMessage(tx: Prisma.TransactionClient, shopId: string, customerId: string, text: string): Promise<void> {
  const now = new Date();
  const conv = await tx.shopConversation.upsert({
    where: { shopId_customerId: { shopId, customerId } },
    create: { shopId, customerId, lastMessageAt: now, customerUnread: 1, shopUnread: 1 },
    update: { lastMessageAt: now, customerUnread: { increment: 1 }, shopUnread: { increment: 1 } },
    select: { id: true },
  });
  await tx.shopMessage.create({ data: { conversationId: conv.id, sender: 'SYSTEM', text, createdAt: now } });
}

/** Cash on delivery counts as paid once the order completes (the customer got it). */
export async function markCodPaid(tx: Prisma.TransactionClient, shopOrderId: string): Promise<void> {
  await tx.payment.updateMany({ where: { shopOrderId, method: 'COD', status: 'PENDING' }, data: { status: 'PAID', paidAt: new Date() } });
}

/** Completed orders count towards each product's "sold" figure. */
export async function addSold(tx: Prisma.TransactionClient, shopOrderId: string): Promise<void> {
  const items = await tx.orderItem.groupBy({ by: ['productId'], where: { shopOrderId }, _sum: { quantity: true } });
  for (const i of items) {
    await tx.product.update({ where: { id: i.productId }, data: { soldCount: { increment: i._sum.quantity ?? 0 } } });
  }
}

/** A completed order that was returned no longer counts towards "sold". */
export async function removeSold(tx: Prisma.TransactionClient, shopOrderId: string): Promise<void> {
  const items = await tx.orderItem.groupBy({ by: ['productId'], where: { shopOrderId }, _sum: { quantity: true } });
  for (const i of items) {
    await tx.product.updateMany({ where: { id: i.productId, soldCount: { gte: i._sum.quantity ?? 0 } }, data: { soldCount: { decrement: i._sum.quantity ?? 0 } } });
  }
}

/**
 * Completed orders a payout can settle: transfers (the shop already holds COD cash) past the
 * return window, so a refund never has to be recovered from money the shop was already paid.
 */
export const settleableOrders = (now: Date): Prisma.ShopOrderWhereInput => ({
  status: 'COMPLETED',
  payoutId: null,
  payments: { none: { method: 'COD' } },
  history: { some: { toStatus: 'COMPLETED', createdAt: { lte: new Date(now.getTime() - RETURN_RULES.windowDays * 86_400_000) } } },
});

/**
 * Moves a shop order from `from` to `to`, only if it is still in `from` (so two clicks or
 * a click racing the deadline sweep can't both apply). Returns false if it had moved on.
 */
export async function moveOrder(
  tx: Prisma.TransactionClient,
  shopOrderId: string,
  from: OrderStatus,
  to: OrderStatus,
  data: Prisma.ShopOrderUpdateManyMutationInput,
  history: { actorType: ActorType | null; actorId: string | null; note?: string | null },
): Promise<boolean> {
  // A wrong bill only matters while the parcel is on its way, and no order moves back to that.
  const { count } = await tx.shopOrder.updateMany({ where: { id: shopOrderId, status: from }, data: { ...data, status: to, billIssueAt: null } });
  if (count === 0) return false;
  await tx.orderStatusHistory.create({
    data: { shopOrderId, fromStatus: from, toStatus: to, actorType: history.actorType, actorId: history.actorId, note: history.note ?? null },
  });
  return true;
}

/**
 * `Setting.points`: points per order total, kip one point is worth when spent, days until it
 * expires. `earnPer` (1 point per this many kip) is the older rule, used until ranges are saved.
 */
export type PointRules = { earnTiers?: PointTier[]; earnPer?: number; redeemValue?: number; expiryDays?: number };
export const pointRules = async (db: Pick<Prisma.TransactionClient, 'setting'>): Promise<PointRules> =>
  ((await db.setting.findUnique({ where: { key: 'points' } }))?.value ?? {}) as PointRules;

/**
 * A cancelled order gives back the points spent on it (once: the shop order's count goes to 0).
 * Their value stays in `platformDiscount`; a cancelled order is never paid out.
 */
export async function returnPoints(tx: Prisma.TransactionClient, shopOrderId: string): Promise<number> {
  const so = await tx.shopOrder.findUnique({ where: { id: shopOrderId }, select: { pointsRedeemed: true, order: { select: { id: true, customerId: true } } } });
  if (!so || so.pointsRedeemed <= 0) return 0;
  const { count } = await tx.shopOrder.updateMany({ where: { id: shopOrderId, pointsRedeemed: so.pointsRedeemed }, data: { pointsRedeemed: 0 } });
  if (!count) return 0;
  await tx.pointTransaction.create({
    data: { customerId: so.order.customerId, type: 'ADJUST', points: so.pointsRedeemed, orderId: so.order.id, note: 'Points returned (order cancelled)' },
  });
  await tx.customer.update({ where: { id: so.order.customerId }, data: { pointsBalance: { increment: so.pointsRedeemed } } });
  return so.pointsRedeemed;
}

/**
 * A returned order gives back the points it earned (once). All of them: if the customer already
 * spent them the balance goes below zero, and points earned later pay that off first.
 */
export async function revokeEarnedPoints(tx: Prisma.TransactionClient, shopOrderId: string, note = 'Points taken back (order returned)'): Promise<number> {
  const so = await tx.shopOrder.findUnique({ where: { id: shopOrderId }, select: { pointsEarned: true, order: { select: { id: true, customerId: true } } } });
  if (!so || so.pointsEarned <= 0) return 0;
  const { count } = await tx.shopOrder.updateMany({ where: { id: shopOrderId, pointsEarned: so.pointsEarned }, data: { pointsEarned: 0 } });
  if (!count) return 0;
  const points = so.pointsEarned;
  await tx.pointTransaction.create({
    data: { customerId: so.order.customerId, type: 'ADJUST', points: -points, orderId: so.order.id, note },
  });
  await tx.customer.update({ where: { id: so.order.customerId }, data: { pointsBalance: { decrement: points } } });
  return points;
}

const earnedFor = (rules: PointRules, total: number): number =>
  rules.earnTiers ? pointsForTotal(rules.earnTiers, total) : rules.earnPer && rules.earnPer > 0 ? Math.floor(total / rules.earnPer) : 0;

/** Points an order earns (0 when earning is off, or nothing in it qualifies). */
export async function pointsFor(db: Pick<Prisma.TransactionClient, 'setting'>, order: { pointsBase: Prisma.Decimal | null; total: Prisma.Decimal }): Promise<number> {
  return earnedFor(await pointRules(db), (order.pointsBase ?? order.total).toNumber());
}

/**
 * Loyalty points (§2.4): by `pointsBase`, expiring after `expiryDays`. Only when the
 * customer confirms they received the order — one that completes on its own earns nothing.
 */
export async function awardPoints(tx: Prisma.TransactionClient, shopOrderId: string): Promise<number> {
  const [order, rules] = await Promise.all([
    tx.shopOrder.findUnique({ where: { id: shopOrderId }, select: { total: true, pointsBase: true, order: { select: { id: true, customerId: true } } } }),
    pointRules(tx),
  ]);
  if (!order) return 0;
  const points = earnedFor(rules, (order.pointsBase ?? order.total).toNumber());
  if (points <= 0) return 0;
  await tx.pointTransaction.create({
    data: {
      customerId: order.order.customerId,
      type: 'EARN',
      points,
      orderId: order.order.id,
      note: 'Order completed',
      expiresAt: rules.expiryDays ? new Date(Date.now() + rules.expiryDays * 86_400_000) : null,
    },
  });
  await tx.customer.update({ where: { id: order.order.customerId }, data: { pointsBalance: { increment: points } } });
  await tx.shopOrder.update({ where: { id: shopOrderId }, data: { pointsEarned: points } });
  return points;
}

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
 * A Taladonline message in the shop–customer chat (both sides see it, both get an unread),
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

/** Completed orders count towards each product's "sold" figure. */
export async function addSold(tx: Prisma.TransactionClient, shopOrderId: string): Promise<void> {
  const items = await tx.orderItem.groupBy({ by: ['productId'], where: { shopOrderId }, _sum: { quantity: true } });
  for (const i of items) {
    await tx.product.update({ where: { id: i.productId }, data: { soldCount: { increment: i._sum.quantity ?? 0 } } });
  }
}

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
  const { count } = await tx.shopOrder.updateMany({ where: { id: shopOrderId, status: from }, data: { ...data, status: to } });
  if (count === 0) return false;
  await tx.orderStatusHistory.create({
    data: { shopOrderId, fromStatus: from, toStatus: to, actorType: history.actorType, actorId: history.actorId, note: history.note ?? null },
  });
  return true;
}

/** Loyalty points for a completed order (§2.4): 1 point per `earnPer` kip, expiring after `expiryDays`. */
export async function awardPoints(tx: Prisma.TransactionClient, shopOrderId: string): Promise<number> {
  const [order, setting] = await Promise.all([
    tx.shopOrder.findUnique({ where: { id: shopOrderId }, select: { total: true, order: { select: { id: true, customerId: true } } } }),
    tx.setting.findUnique({ where: { key: 'points' } }),
  ]);
  const rules = (setting?.value ?? {}) as { earnPer?: number; expiryDays?: number };
  if (!order || !rules.earnPer || rules.earnPer <= 0) return 0;
  const points = Math.floor(order.total.toNumber() / rules.earnPer);
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
  return points;
}

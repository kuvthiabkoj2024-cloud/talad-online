/**
 * Demo data for Seller Center sections: reviews on completed demo orders (one with a
 * shop reply), a running flash sale and two past payouts. Idempotent.
 */
import type { PrismaClient } from '../src/generated/prisma/client.js';

const DAY = 86_400_000;

const REVIEWS: [number, string][] = [
  [5, 'ສິນຄ້າດີຫຼາຍ ສົ່ງໄວ ຫໍ່ມາຢ່າງດີ. Great quality, fast delivery!'],
  [4, 'Good product, matches the photos. Packaging could be better.'],
  [5, 'ຖືກໃຈຫຼາຍ ຈະສັ່ງອີກ.'],
  [3, 'OK for the price, but delivery took longer than expected.'],
];

export async function seedDemoShopExtras(prisma: PrismaClient, shopId: string, customerIds: string[]): Promise<void> {
  // Reviews: one per completed order line, from the demo customers.
  const lines = await prisma.orderItem.findMany({
    where: { shopOrder: { shopId, status: 'COMPLETED', order: { customerId: { in: customerIds } } }, review: null },
    select: { id: true, productId: true, shopOrder: { select: { order: { select: { customerId: true } } } } },
  });
  for (const [i, line] of lines.entries()) {
    const [rating, comment] = REVIEWS[i % REVIEWS.length];
    await prisma.review.create({
      data: {
        target: 'PRODUCT',
        targetId: line.productId,
        customerId: line.shopOrder.order.customerId,
        orderItemId: line.id,
        rating,
        comment,
        createdAt: new Date(Date.now() - (i + 1) * 2 * DAY),
        ...(i === 0 && { reply: 'ຂອບໃຈຫຼາຍໆ! Thank you for shopping with us.', repliedAt: new Date(Date.now() - DAY) }),
      },
    });
  }
  if (lines.length) {
    // Keep product rating figures in step with the reviews.
    const stats = await prisma.review.groupBy({
      by: ['targetId'],
      where: { target: 'PRODUCT', targetId: { in: lines.map((l) => l.productId) } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    for (const s of stats) {
      await prisma.product.update({
        where: { id: s.targetId },
        data: { ratingAvg: s._avg.rating ?? 0, ratingCount: s._count._all },
      });
    }
    console.log(`Added ${lines.length} demo reviews`);
  }

  // A flash sale running now, so the storefront strip and sale prices show.
  if (!(await prisma.flashSale.count({ where: { shopId } }))) {
    const products = await prisma.product.findMany({
      where: { shopId, slug: { in: ['bolaven-arabica-500g', 'wireless-earbuds', 'handwoven-silk-sinh'] } },
      select: { id: true, slug: true },
    });
    const percent: Record<string, number> = { 'bolaven-arabica-500g': 20, 'wireless-earbuds': 15, 'handwoven-silk-sinh': 10 };
    await prisma.flashSale.create({
      data: {
        shopId,
        name: 'Weekend flash sale',
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 3 * DAY),
        items: { create: products.map((p) => ({ productId: p.id, discountPercent: percent[p.slug] })) },
      },
    });
    console.log('Added a demo flash sale');
  }

  // A past settlement for the Finance page: completed orders older than two weeks, paid out.
  if (!(await prisma.payout.count({ where: { shopId } }))) {
    const periodEnd = new Date(Date.now() - 14 * DAY);
    const periodStart = new Date(periodEnd.getTime() - 30 * DAY);
    const settled = await prisma.shopOrder.aggregate({
      where: { shopId, status: 'COMPLETED', createdAt: { gte: periodStart, lt: periodEnd } },
      _sum: { total: true, commissionAmount: true },
    });
    const gross = settled._sum.total?.toNumber() ?? 0;
    const commission = settled._sum.commissionAmount?.toNumber() ?? 0;
    if (gross > 0) {
      await prisma.payout.create({
        data: {
          shopId,
          periodStart,
          periodEnd,
          grossAmount: gross,
          commissionAmount: commission,
          netAmount: gross - commission,
          status: 'PAID',
          paidAt: new Date(periodEnd.getTime() + 3 * DAY),
          reference: `BCEL-${periodEnd.toISOString().slice(0, 10).replaceAll('-', '')}`,
        },
      });
      console.log('Added a demo payout');
    }
  }
}

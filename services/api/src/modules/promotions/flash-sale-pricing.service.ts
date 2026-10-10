import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface FlashDiscount {
  percent: number;
  endsAt: Date;
}

/** Sale price for `price` at `percent` off, in whole kip. */
export const flashPrice = (price: number, percent: number) => Math.round((price * (100 - percent)) / 100);

/**
 * Which products are in a running flash sale (§3.4), used wherever a price is shown or
 * charged: product cards and pages, cart and checkout.
 */
@Injectable()
export class FlashSalePricingService {
  constructor(private readonly prisma: PrismaService) {}

  async discounts(productIds: string[], now = new Date()): Promise<Map<string, FlashDiscount>> {
    const map = new Map<string, FlashDiscount>();
    if (productIds.length === 0) return map;
    const items = await this.prisma.flashSaleItem.findMany({
      where: {
        productId: { in: [...new Set(productIds)] },
        flashSale: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now }, shop: { status: 'APPROVED' } },
      },
      select: { productId: true, discountPercent: true, flashSale: { select: { endsAt: true } } },
    });
    for (const i of items) {
      const current = map.get(i.productId);
      if (!current || i.discountPercent > current.percent) {
        map.set(i.productId, { percent: i.discountPercent, endsAt: i.flashSale.endsAt });
      }
    }
    return map;
  }
}

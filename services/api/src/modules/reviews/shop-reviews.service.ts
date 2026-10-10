import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';

export interface ShopReview {
  id: string;
  rating: number;
  comment: string | null;
  mediaUrls: string[];
  reply: string | null;
  repliedAt: Date | null;
  isHidden: boolean;
  createdAt: Date;
  customer: { name: string };
  /** null for a review of the shop itself. */
  product: { id: string; name: string; slug: string; imageUrl: string | null } | null;
}

export interface ShopReviewList {
  items: ShopReview[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: { average: number; count: number; unreplied: number; byRating: Record<1 | 2 | 3 | 4 | 5, number> };
}

/** Reviews of the shop and its products, with the shop's replies (§3.8). */
@Injectable()
export class ShopReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async list(
    shopId: string,
    filter: { rating?: number; unreplied?: boolean; page: number; pageSize: number },
  ): Promise<ShopReviewList> {
    const products = await this.prisma.product.findMany({
      where: { shopId },
      select: { id: true, name: true, slug: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const mine: Prisma.ReviewWhereInput = {
      OR: [
        { target: 'PRODUCT', targetId: { in: products.map((p) => p.id) } },
        { target: 'SHOP', targetId: shopId },
      ],
    };
    const where: Prisma.ReviewWhereInput = {
      ...mine,
      ...(filter.rating && { rating: filter.rating }),
      ...(filter.unreplied && { reply: null }),
    };
    const [rows, total, groups, unreplied] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: { customer: { select: { name: true } } },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({ by: ['rating'], where: mine, _count: { _all: true } }),
      this.prisma.review.count({ where: { ...mine, reply: null } }),
    ]);

    const byRating = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as ShopReviewList['summary']['byRating'];
    let count = 0;
    let sum = 0;
    for (const g of groups) {
      byRating[g.rating as 1 | 2 | 3 | 4 | 5] = g._count._all;
      count += g._count._all;
      sum += g.rating * g._count._all;
    }

    return {
      items: rows.map((r) => {
        const p = r.target === 'PRODUCT' ? byId.get(r.targetId) : undefined;
        return {
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          mediaUrls: r.mediaKeys.map((k) => this.media.publicUrl(k)),
          reply: r.reply,
          repliedAt: r.repliedAt,
          isHidden: r.isHidden,
          createdAt: r.createdAt,
          customer: { name: r.customer.name },
          product: p
            ? { id: p.id, name: p.name, slug: p.slug, imageUrl: p.images[0] ? this.media.publicUrl(p.images[0].key) : null }
            : null,
        };
      }),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filter.pageSize)),
      summary: { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, unreplied, byRating },
    };
  }

  /** Public reply under a review; `null` removes it. */
  async reply(shopId: string, id: string, reply: string | null) {
    const review = await this.prisma.review.findUnique({ where: { id } });
    const owns =
      review &&
      (review.target === 'SHOP'
        ? review.targetId === shopId
        : !!(await this.prisma.product.findFirst({ where: { id: review.targetId, shopId }, select: { id: true } })));
    if (!owns) throw new NotFoundException('Review not found');
    const saved = await this.prisma.review.update({
      where: { id },
      data: { reply, repliedAt: reply ? new Date() : null },
    });
    return { reply: saved.reply, repliedAt: saved.repliedAt };
  }
}

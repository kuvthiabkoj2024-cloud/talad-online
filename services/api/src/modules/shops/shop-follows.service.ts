import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { avatarPrefix } from '../auth/customer-auth.service.js';
import { MediaService } from '../media/media.service.js';

export interface FollowState {
  following: boolean;
  followers: number;
}

export interface FollowedShop {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  verified: boolean;
  productCount: number;
  followers: number;
  followedAt: Date;
}

export interface FollowerPage {
  items: { customer: { id: string; name: string; avatarUrl: string | null }; followedAt: Date }[];
  nextCursor: string | null;
  total: number;
}

/**
 * Customers following shops (§3.2). The count lives on the shop for listings; the rows let
 * feeds and notifications favour followed shops later.
 */
@Injectable()
export class ShopFollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async state(customerId: string, shopId: string): Promise<FollowState> {
    const [shop, row] = await Promise.all([
      this.prisma.shop.findFirst({ where: { id: shopId, status: 'APPROVED' }, select: { followerCount: true } }),
      this.prisma.shopFollow.findUnique({ where: { customerId_shopId: { customerId, shopId } }, select: { shopId: true } }),
    ]);
    if (!shop) throw new NotFoundException({ code: 'SHOP_NOT_FOUND', message: 'Shop not found' });
    return { following: row !== null, followers: shop.followerCount };
  }

  /** Follows or unfollows; repeating either is harmless. Owners can't follow their own shop. */
  async set(customerId: string, shopId: string, follow: boolean): Promise<FollowState> {
    const shop = await this.prisma.shop.findFirst({ where: { id: shopId, status: 'APPROVED' }, select: { ownerId: true } });
    if (!shop) throw new NotFoundException({ code: 'SHOP_NOT_FOUND', message: 'Shop not found' });
    if (follow && shop.ownerId === customerId) {
      throw new ForbiddenException({ code: 'OWN_SHOP', message: "You can't follow your own shop" });
    }
    const followers = await this.prisma.$transaction(async (tx) => {
      const changed = follow
        ? (await tx.shopFollow.createMany({ data: [{ customerId, shopId }], skipDuplicates: true })).count
        : (await tx.shopFollow.deleteMany({ where: { customerId, shopId } })).count;
      const updated = changed
        ? await tx.shop.update({ where: { id: shopId }, data: { followerCount: { increment: follow ? 1 : -1 } }, select: { followerCount: true } })
        : await tx.shop.findUniqueOrThrow({ where: { id: shopId }, select: { followerCount: true } });
      return Math.max(0, updated.followerCount);
    });
    return { following: follow, followers };
  }

  async followingAmong(customerId: string, shopIds: string[]): Promise<{ shopIds: string[] }> {
    if (!shopIds.length) return { shopIds: [] };
    const rows = await this.prisma.shopFollow.findMany({ where: { customerId, shopId: { in: shopIds } }, select: { shopId: true } });
    return { shopIds: rows.map((r) => r.shopId) };
  }

  /** The shops a customer follows, most recently followed first. */
  async mine(customerId: string): Promise<FollowedShop[]> {
    const rows = await this.prisma.shopFollow.findMany({
      where: { customerId, shop: { status: 'APPROVED' } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        createdAt: true,
        shop: {
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            verifiedAt: true,
            followerCount: true,
            _count: { select: { products: { where: { status: 'PUBLISHED' } } } },
          },
        },
      },
    });
    return rows.map(({ createdAt, shop }) => ({
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      logoUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null,
      verified: shop.verifiedAt !== null,
      productCount: shop._count.products,
      followers: shop.followerCount,
      followedAt: createdAt,
    }));
  }

  /** Seller Center: who follows the shop, newest first. */
  async followers(shopId: string, cursor: string | undefined, limit: number): Promise<FollowerPage> {
    const [rows, total] = await Promise.all([
      this.prisma.shopFollow.findMany({
        where: { shopId },
        orderBy: [{ createdAt: 'desc' }, { customerId: 'desc' }],
        take: limit + 1,
        ...(cursor && { cursor: { customerId_shopId: { customerId: cursor, shopId } }, skip: 1 }),
        select: { createdAt: true, customer: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      this.prisma.shopFollow.count({ where: { shopId } }),
    ]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((r) => ({
        followedAt: r.createdAt,
        // Uploaded avatars are private files; only social-login pictures are public links.
        customer: { ...r.customer, avatarUrl: r.customer.avatarUrl && !r.customer.avatarUrl.startsWith(avatarPrefix(r.customer.id)) ? r.customer.avatarUrl : null },
      })),
      nextCursor: rows.length > limit ? items[items.length - 1].customer.id : null,
      total,
    };
  }
}

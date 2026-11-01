import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MediaService } from '../../media/media.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import type { FeedPostItem } from '../products/products.service.js';
import { feedPostInclude, publicAvatar, toFeedPost } from './feed-posts.service.js';

/** A customer's public profile: who they are and their numbers. */
export interface CustomerProfileView {
  id: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: Date;
  followers: number;
  following: number;
  videos: number;
  /** Likes across all their videos. */
  likes: number;
}

export interface ProfileVideoPage {
  items: FeedPostItem[];
  nextCursor: string | null;
}

export interface ProfileFollowerPage {
  items: { id: string; name: string; avatarUrl: string | null; followedAt: Date }[];
  nextCursor: string | null;
  total: number;
}

/** A video the viewer liked: a customer's post, or a shop's product video they saved. */
export interface LikedVideo {
  kind: 'post' | 'product';
  id: string;
  videoUrl: string;
  posterUrl: string | null;
  title: string;
  stats: { views: number; likes: number; comments: number; shares: number };
  likedAt: Date;
}

export interface LikedVideoPage {
  items: LikedVideo[];
  /** "<ms>.<id>" of the last item. */
  nextCursor: string | null;
  total: number;
}

export interface ProfileFollowState {
  following: boolean;
  followers: number;
}

const ACTIVE = { isActive: true } as const;
/** What a customer can still watch: nothing hidden, taken down, or from a closed account or shop. */
const LIKED_POST = { isHidden: false, customer: ACTIVE } satisfies Prisma.FeedPostWhereInput;
const LIKED_PRODUCT = { status: 'PUBLISHED', shop: { status: 'APPROVED' }, videoKey: { not: null }, videoHidden: false } satisfies Prisma.ProductWhereInput;

/**
 * Customers' public profiles in the video feed: their videos, followers, and following other
 * customers. Only the name and a social-login picture are shown; nothing else about the account.
 */
@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  async profile(customerId: string): Promise<CustomerProfileView> {
    const c = await this.prisma.customer.findFirst({
      where: { id: customerId, ...ACTIVE },
      select: { id: true, name: true, avatarUrl: true, createdAt: true, _count: { select: { followers: { where: { follower: ACTIVE } }, following: { where: { following: ACTIVE } } } } },
    });
    if (!c) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
    const posts = await this.prisma.feedPost.aggregate({ where: { customerId, isHidden: false }, _count: { _all: true }, _sum: { likeCount: true } });
    return {
      id: c.id,
      name: c.name,
      avatarUrl: publicAvatar(c),
      joinedAt: c.createdAt,
      followers: c._count.followers,
      following: c._count.following,
      videos: posts._count._all,
      likes: posts._sum.likeCount ?? 0,
    };
  }

  /** Their videos, newest first. */
  async videos(customerId: string, cursor: string | undefined, limit: number): Promise<ProfileVideoPage> {
    await this.assertActive(customerId);
    const rows = await this.prisma.feedPost.findMany({
      where: { customerId, isHidden: false },
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: feedPostInclude,
    });
    const items = rows.slice(0, limit);
    return { items: items.map((p) => toFeedPost(this.media, p)), nextCursor: rows.length > limit ? items[items.length - 1].id : null };
  }

  /** Who follows them, newest first. */
  async followers(customerId: string, cursor: string | undefined, limit: number): Promise<ProfileFollowerPage> {
    await this.assertActive(customerId);
    const where = { followingId: customerId, follower: ACTIVE };
    const [rows, total] = await Promise.all([
      this.prisma.customerFollow.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { followerId: 'desc' }],
        take: limit + 1,
        ...(cursor && { cursor: { followerId_followingId: { followerId: cursor, followingId: customerId } }, skip: 1 }),
        select: { createdAt: true, follower: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      this.prisma.customerFollow.count({ where }),
    ]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((r) => ({ id: r.follower.id, name: r.follower.name, avatarUrl: publicAvatar(r.follower), followedAt: r.createdAt })),
      nextCursor: rows.length > limit ? items[items.length - 1].follower.id : null,
      total,
    };
  }

  /** Who they follow, newest first. */
  async following(customerId: string, cursor: string | undefined, limit: number): Promise<ProfileFollowerPage> {
    await this.assertActive(customerId);
    const where = { followerId: customerId, following: ACTIVE };
    const [rows, total] = await Promise.all([
      this.prisma.customerFollow.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { followingId: 'desc' }],
        take: limit + 1,
        ...(cursor && { cursor: { followerId_followingId: { followerId: customerId, followingId: cursor } }, skip: 1 }),
        select: { createdAt: true, following: { select: { id: true, name: true, avatarUrl: true } } },
      }),
      this.prisma.customerFollow.count({ where }),
    ]);
    const items = rows.slice(0, limit);
    return {
      items: items.map((r) => ({ id: r.following.id, name: r.following.name, avatarUrl: publicAvatar(r.following), followedAt: r.createdAt })),
      nextCursor: rows.length > limit ? items[items.length - 1].following.id : null,
      total,
    };
  }

  /** The videos this customer liked, most recently liked first. Theirs alone to see. */
  async liked(customerId: string, cursor: string | undefined, limit: number): Promise<LikedVideoPage> {
    const [ms, lastId] = cursor?.split('.') ?? [];
    const time = ms ? new Date(Number(ms)) : null;
    // Two lists merged by when they were liked; the id settles likes made in the same instant.
    const beforePost = time ? { OR: [{ createdAt: { lt: time } }, { createdAt: time, postId: { lt: lastId } }] } : {};
    const beforeProduct = time ? { OR: [{ createdAt: { lt: time } }, { createdAt: time, productId: { lt: lastId } }] } : {};
    const postWhere = { customerId, post: LIKED_POST };
    const productWhere = { customerId, product: LIKED_PRODUCT };
    const [posts, products, postCount, productCount] = await Promise.all([
      this.prisma.feedPostLike.findMany({
        where: { ...postWhere, ...beforePost },
        orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
        take: limit + 1,
        select: { createdAt: true, post: true },
      }),
      this.prisma.wishlistItem.findMany({
        where: { ...productWhere, ...beforeProduct },
        orderBy: [{ createdAt: 'desc' }, { productId: 'desc' }],
        take: limit + 1,
        select: {
          createdAt: true,
          product: {
            select: {
              id: true,
              name: true,
              videoKey: true,
              videoViewCount: true,
              videoCommentCount: true,
              videoShareCount: true,
              images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
              _count: { select: { wishlistBy: true } },
            },
          },
        },
      }),
      this.prisma.feedPostLike.count({ where: postWhere }),
      this.prisma.wishlistItem.count({ where: productWhere }),
    ]);
    const merged: LikedVideo[] = [
      ...posts.map(({ createdAt, post: p }): LikedVideo => ({
        kind: 'post',
        id: p.id,
        videoUrl: this.media.publicUrl(p.videoKey),
        posterUrl: null,
        title: p.caption,
        stats: { views: p.viewCount, likes: p.likeCount, comments: p.commentCount, shares: p.shareCount },
        likedAt: createdAt,
      })),
      ...products.map(({ createdAt, product: p }): LikedVideo => ({
        kind: 'product',
        id: p.id,
        videoUrl: this.media.publicUrl(p.videoKey!),
        posterUrl: p.images[0] ? this.media.publicUrl(p.images[0].key) : null,
        title: p.name,
        stats: { views: p.videoViewCount, likes: p._count.wishlistBy, comments: p.videoCommentCount, shares: p.videoShareCount },
        likedAt: createdAt,
      })),
    ].sort((a, b) => b.likedAt.getTime() - a.likedAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    const items = merged.slice(0, limit);
    const last = items[items.length - 1];
    return { items, nextCursor: merged.length > limit && last ? `${last.likedAt.getTime()}.${last.id}` : null, total: postCount + productCount };
  }

  /** Follows or unfollows; repeating either is harmless. The person followed hears about it. */
  async setFollow(followerId: string, followingId: string, follow: boolean): Promise<ProfileFollowState> {
    if (followerId === followingId) throw new BadRequestException({ code: 'OWN_PROFILE', message: "You can't follow yourself" });
    await this.assertActive(followingId);
    await this.prisma.$transaction(async (tx) => {
      const changed = follow
        ? (await tx.customerFollow.createMany({ data: [{ followerId, followingId }], skipDuplicates: true })).count
        : (await tx.customerFollow.deleteMany({ where: { followerId, followingId } })).count;
      if (follow && changed) {
        const who = (await tx.customer.findUnique({ where: { id: followerId }, select: { name: true } }))?.name || '—';
        await this.notifications.send(tx, followingId, 'SYSTEM', {
          lo: { title: `${who} ເລີ່ມຕິດຕາມທ່ານ`, body: 'ເບິ່ງໂປຣໄຟລ໌ຂອງເຂົາເຈົ້າ' },
          en: { title: `${who} started following you`, body: 'See their profile' },
        }, { link: `/u/${followerId}` });
      }
    });
    return { following: follow, followers: await this.prisma.customerFollow.count({ where: { followingId, follower: ACTIVE } }) };
  }

  /** Which of these customers the viewer follows (the feed is cached, so it asks separately). */
  async followingAmong(followerId: string, ids: string[]): Promise<{ customerIds: string[] }> {
    if (!ids.length) return { customerIds: [] };
    const rows = await this.prisma.customerFollow.findMany({ where: { followerId, followingId: { in: ids } }, select: { followingId: true } });
    return { customerIds: rows.map((r) => r.followingId) };
  }

  private async assertActive(customerId: string) {
    const found = await this.prisma.customer.count({ where: { id: customerId, ...ACTIVE } });
    if (!found) throw new NotFoundException({ code: 'PROFILE_NOT_FOUND', message: 'Profile not found' });
  }
}

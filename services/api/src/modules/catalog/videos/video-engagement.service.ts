import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { avatarPrefix } from '../../auth/customer-auth.service.js';
import { MediaService } from '../../media/media.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

export const COMMENT_MAX_LENGTH = 500;

export interface VideoStats {
  views: number;
  favorites: number;
  comments: number;
  shares: number;
}

export interface VideoCommentView {
  id: string;
  parentId: string | null;
  /** Null once deleted; the row stays so its replies keep their thread. */
  body: string | null;
  createdAt: Date;
  replyCount: number;
  /** `isShop`: the shop answering from Seller Center (its name and logo). */
  author: { id: string; name: string; avatarUrl: string | null; isShop: boolean };
}

/** A shop's video with its numbers, for Seller Center. */
export interface ShopVideoView {
  productId: string;
  name: string;
  slug: string;
  status: string;
  videoUrl: string;
  imageUrl: string | null;
  price: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface ShopVideoList {
  items: ShopVideoView[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Across all of the shop's videos. */
  totals: { views: number; likes: number; comments: number; shares: number };
}

export interface VideoLikePage {
  items: { customer: { id: string; name: string; avatarUrl: string | null }; createdAt: Date }[];
  nextCursor: string | null;
}

export interface VideoCommentPage {
  items: VideoCommentView[];
  /** Pass back as `cursor`; null on the last page. */
  nextCursor: string | null;
}

/** Only published products from approved shops have a public video. */
const VISIBLE = { status: 'PUBLISHED', shop: { status: 'APPROVED' }, videoKey: { not: null } } as const;

const commentSelect = {
  id: true,
  parentId: true,
  body: true,
  createdAt: true,
  replyCount: true,
  deletedAt: true,
  byShop: true,
  customer: { select: { id: true, name: true, avatarUrl: true } },
  product: { select: { shop: { select: { id: true, name: true, logoUrl: true } } } },
} as const;

type CommentRow = {
  id: string;
  parentId: string | null;
  body: string;
  createdAt: Date;
  replyCount: number;
  deletedAt: Date | null;
  byShop: boolean;
  customer: { id: string; name: string; avatarUrl: string | null };
  product: { shop: { id: string; name: string; logoUrl: string | null } };
};

/** Trimmed comment text, or a 400 when it's empty or too long. */
export function cleanCommentBody(raw: string): string {
  const body = raw.replace(/\s+\n/g, '\n').trim();
  if (!body) throw new BadRequestException({ code: 'COMMENT_EMPTY', message: 'Comment is empty' });
  if (body.length > COMMENT_MAX_LENGTH) {
    throw new BadRequestException({ code: 'COMMENT_TOO_LONG', message: `At most ${COMMENT_MAX_LENGTH} characters` });
  }
  return body;
}

/** Views, favorites, comments (with one level of replies) and shares on product feed videos (§2.5, §4.7). */
@Injectable()
export class VideoEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly media: MediaService,
  ) {}

  /** Tells the shop someone liked or commented on its video (not when it's the owner themself). */
  private async tellShop(customerId: string, productId: string, text: (who: string, product: string) => { lo: { title: string; body: string }; en: { title: string; body: string } }) {
    const [product, customer] = await Promise.all([
      this.prisma.product.findUnique({ where: { id: productId }, select: { name: true, shopId: true, shop: { select: { ownerId: true } } } }),
      this.prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } }),
    ]);
    if (!product || product.shop.ownerId === customerId) return;
    await this.notifications.toShop(this.prisma, product.shopId, 'ACTIVITY', text(customer?.name || '—', product.name), { link: '/videos' });
  }

  async stats(productId: string): Promise<VideoStats> {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, ...VISIBLE },
      select: { videoViewCount: true, videoShareCount: true, videoCommentCount: true, _count: { select: { wishlistBy: true } } },
    });
    if (!p) throw new NotFoundException('Video not found');
    return { views: p.videoViewCount, favorites: p._count.wishlistBy, comments: p.videoCommentCount, shares: p.videoShareCount };
  }

  /** One play. The client reports each video once per visit after a few seconds of watching. */
  async recordView(productId: string): Promise<{ views: number }> {
    const p = await this.bump(productId, { videoViewCount: { increment: 1 } });
    return { views: p.videoViewCount };
  }

  async recordShare(productId: string): Promise<{ shares: number }> {
    const p = await this.bump(productId, { videoShareCount: { increment: 1 } });
    return { shares: p.videoShareCount };
  }

  private async bump(productId: string, data: { videoViewCount?: { increment: number }; videoShareCount?: { increment: number } }) {
    const { count } = await this.prisma.product.updateMany({ where: { id: productId, ...VISIBLE }, data });
    if (!count) throw new NotFoundException('Video not found');
    return this.prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { videoViewCount: true, videoShareCount: true } });
  }

  /* ── Favorites: the product's video is favorited by saving the product to the wishlist ── */

  async setFavorite(customerId: string, productId: string, on: boolean): Promise<{ favorited: boolean; favorites: number }> {
    if (on) {
      await this.assertVisible(productId);
      // Only a new like is announced (tapping again doesn't notify twice).
      const { count } = await this.prisma.wishlistItem.createMany({ data: [{ customerId, productId }], skipDuplicates: true });
      if (count) {
        await this.tellShop(customerId, productId, (who, product) => ({
          lo: { title: `${who} ມັກວິດີໂອຂອງທ່ານ`, body: product },
          en: { title: `${who} liked your video`, body: product },
        }));
      }
    } else {
      await this.prisma.wishlistItem.deleteMany({ where: { customerId, productId } });
    }
    return { favorited: on, favorites: await this.prisma.wishlistItem.count({ where: { productId } }) };
  }

  /** Which of `productIds` this customer has favorited (the public feed is cached, so this is fetched separately). */
  async favoritedAmong(customerId: string, productIds: string[]): Promise<{ productIds: string[] }> {
    if (!productIds.length) return { productIds: [] };
    const rows = await this.prisma.wishlistItem.findMany({
      where: { customerId, productId: { in: productIds } },
      select: { productId: true },
    });
    return { productIds: rows.map((r) => r.productId) };
  }

  /* ── Comments ── */

  /** Top-level comments, newest first. */
  async comments(productId: string, cursor: string | undefined, limit: number): Promise<VideoCommentPage> {
    await this.assertVisible(productId);
    return this.page({ productId, parentId: null }, 'desc', cursor, limit);
  }

  /** Replies to one comment, oldest first so the conversation reads top to bottom. */
  async replies(productId: string, commentId: string, cursor: string | undefined, limit: number): Promise<VideoCommentPage> {
    return this.page({ productId, parentId: commentId }, 'asc', cursor, limit);
  }

  private async page(
    where: { productId: string; parentId: string | null },
    order: 'asc' | 'desc',
    cursor: string | undefined,
    limit: number,
  ): Promise<VideoCommentPage> {
    const rows = await this.prisma.videoComment.findMany({
      // A deleted comment only stays (as a placeholder) while it still holds replies.
      where: { ...where, OR: [{ deletedAt: null }, { replyCount: { gt: 0 } }] },
      // UUIDv7 ids are time-ordered, so the id doubles as a stable sort key.
      orderBy: { id: order },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: commentSelect,
    });
    const items = rows.slice(0, limit);
    return {
      items: items.map((r) => this.toView(r)),
      nextCursor: rows.length > limit ? items[items.length - 1].id : null,
    };
  }

  async addComment(customerId: string, productId: string, rawBody: string, parentId?: string): Promise<VideoCommentView> {
    const body = cleanCommentBody(rawBody);
    await this.assertVisible(productId);

    // Replies stay one level deep: answering a reply joins the top-level thread it belongs to.
    let threadId: string | null = null;
    if (parentId) {
      const parent = await this.prisma.videoComment.findFirst({ where: { id: parentId, productId }, select: { id: true, parentId: true } });
      if (!parent) throw new NotFoundException('Comment not found');
      threadId = parent.parentId ?? parent.id;
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.videoComment.create({
        data: { productId, customerId, body, parentId: threadId },
        select: commentSelect,
      });
      await tx.product.update({ where: { id: productId }, data: { videoCommentCount: { increment: 1 } } });
      if (threadId) await tx.videoComment.update({ where: { id: threadId }, data: { replyCount: { increment: 1 } } });
      return created;
    });
    const excerpt = body.length > 80 ? `${body.slice(0, 79)}…` : body;
    await this.tellShop(customerId, productId, (who, product) =>
      threadId
        ? { lo: { title: `${who} ຕອບຄຳເຫັນ · ${product}`, body: `“${excerpt}”` }, en: { title: `${who} replied on ${product}`, body: `“${excerpt}”` } }
        : { lo: { title: `${who} ສະແດງຄຳເຫັນ · ${product}`, body: `“${excerpt}”` }, en: { title: `${who} commented on ${product}`, body: `“${excerpt}”` } },
    );
    return this.toView(row);
  }

  /** Authors delete their own comments. */
  async deleteComment(customerId: string, commentId: string): Promise<{ deleted: true }> {
    const c = await this.prisma.videoComment.findUnique({
      where: { id: commentId },
      select: { customerId: true, productId: true, parentId: true, deletedAt: true },
    });
    if (!c || c.deletedAt) throw new NotFoundException('Comment not found');
    if (c.customerId !== customerId) throw new ForbiddenException('Not your comment');
    await this.prisma.$transaction([
      this.prisma.videoComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } }),
      this.prisma.product.update({ where: { id: c.productId }, data: { videoCommentCount: { decrement: 1 } } }),
      ...(c.parentId ? [this.prisma.videoComment.update({ where: { id: c.parentId }, data: { replyCount: { decrement: 1 } } })] : []),
    ]);
    return { deleted: true };
  }

  /* ── Seller Center: the shop's own videos ── */

  /** The shop's videos, newest first, each with views, likes, comments and shares. */
  async shopVideos(shopId: string, page: number, pageSize: number): Promise<ShopVideoList> {
    const where = { shopId, videoKey: { not: null } };
    const [total, rows, sums, likes] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          price: true,
          videoKey: true,
          videoViewCount: true,
          videoShareCount: true,
          videoCommentCount: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
          _count: { select: { wishlistBy: true } },
        },
      }),
      this.prisma.product.aggregate({ where, _sum: { videoViewCount: true, videoShareCount: true, videoCommentCount: true } }),
      this.prisma.wishlistItem.count({ where: { product: where } }),
    ]);
    return {
      items: rows.map((p) => ({
        productId: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        videoUrl: this.media.publicUrl(p.videoKey!),
        imageUrl: p.images[0] ? this.media.publicUrl(p.images[0].key) : null,
        price: p.price.toNumber(),
        views: p.videoViewCount,
        likes: p._count.wishlistBy,
        comments: p.videoCommentCount,
        shares: p.videoShareCount,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      totals: {
        views: sums._sum.videoViewCount ?? 0,
        likes,
        comments: sums._sum.videoCommentCount ?? 0,
        shares: sums._sum.videoShareCount ?? 0,
      },
    };
  }

  /** Who liked (saved) the video, newest first. */
  async shopLikes(shopId: string, productId: string, cursor: string | undefined, limit: number): Promise<VideoLikePage> {
    await this.assertShopVideo(shopId, productId);
    const rows = await this.prisma.wishlistItem.findMany({
      where: { productId },
      orderBy: [{ createdAt: 'desc' }, { customerId: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { customerId_productId: { customerId: cursor, productId } }, skip: 1 }),
      select: { createdAt: true, customer: { select: { id: true, name: true, avatarUrl: true } } },
    });
    const items = rows.slice(0, limit);
    return {
      items: items.map((r) => ({ createdAt: r.createdAt, customer: { ...r.customer, avatarUrl: this.publicAvatar(r.customer) } })),
      nextCursor: rows.length > limit ? items[items.length - 1].customer.id : null,
    };
  }

  /** Comments on the shop's video (also while the product isn't published). */
  async shopComments(shopId: string, productId: string, cursor: string | undefined, limit: number): Promise<VideoCommentPage> {
    await this.assertShopVideo(shopId, productId);
    return this.page({ productId, parentId: null }, 'desc', cursor, limit);
  }

  async shopReplies(shopId: string, productId: string, commentId: string, cursor: string | undefined, limit: number): Promise<VideoCommentPage> {
    await this.assertShopVideo(shopId, productId);
    return this.page({ productId, parentId: commentId }, 'asc', cursor, limit);
  }

  /**
   * The shop answers (or comments) as itself. Stored under the owner's account with
   * `byShop`, shown with the shop's name; the customer it answers is notified.
   */
  async shopComment(shop: { id: string; ownerId: string | null; name: string }, productId: string, rawBody: string, parentId?: string): Promise<VideoCommentView> {
    const body = cleanCommentBody(rawBody);
    // Seller Center sessions always belong to the owner; a shop without one can't post.
    const ownerId = shop.ownerId;
    if (!ownerId) throw new ForbiddenException('This shop has no owner account');
    const product = await this.assertShopVideo(shop.id, productId);
    let parent: { id: string; customerId: string; byShop: boolean } | null = null;
    if (parentId) {
      const found = await this.prisma.videoComment.findFirst({ where: { id: parentId, productId }, select: { id: true, parentId: true, customerId: true, byShop: true } });
      if (!found) throw new NotFoundException('Comment not found');
      parent = { id: found.parentId ?? found.id, customerId: found.customerId, byShop: found.byShop };
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.videoComment.create({
        data: { productId, customerId: ownerId, body, parentId: parent?.id ?? null, byShop: true },
        select: commentSelect,
      });
      await tx.product.update({ where: { id: productId }, data: { videoCommentCount: { increment: 1 } } });
      if (parent) await tx.videoComment.update({ where: { id: parent.id }, data: { replyCount: { increment: 1 } } });
      if (parent && !parent.byShop && parent.customerId !== ownerId) {
        const excerpt = body.length > 80 ? `${body.slice(0, 79)}…` : body;
        await this.notifications.send(
          tx,
          parent.customerId,
          'SYSTEM',
          {
            lo: { title: `${shop.name} ຕອບຄຳເຫັນຂອງທ່ານ`, body: `“${excerpt}”` },
            en: { title: `${shop.name} replied to your comment`, body: `“${excerpt}”` },
          },
          { link: `/p/${product.shop.slug}/${product.slug}`, ...(product.images[0] && { imageUrl: product.images[0].key }) },
        );
      }
      return created;
    });
    return this.toView(row);
  }

  /** The shop removes a comment on its own video (spam, abuse). */
  async shopDeleteComment(shopId: string, commentId: string): Promise<{ deleted: true }> {
    const c = await this.prisma.videoComment.findFirst({
      where: { id: commentId, deletedAt: null, product: { shopId } },
      select: { productId: true, parentId: true },
    });
    if (!c) throw new NotFoundException('Comment not found');
    await this.prisma.$transaction([
      this.prisma.videoComment.update({ where: { id: commentId }, data: { deletedAt: new Date() } }),
      this.prisma.product.update({ where: { id: c.productId }, data: { videoCommentCount: { decrement: 1 } } }),
      ...(c.parentId ? [this.prisma.videoComment.update({ where: { id: c.parentId }, data: { replyCount: { decrement: 1 } } })] : []),
    ]);
    return { deleted: true };
  }

  private async assertShopVideo(shopId: string, productId: string) {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, shopId, videoKey: { not: null } },
      select: { slug: true, shop: { select: { slug: true } }, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } } },
    });
    if (!p) throw new NotFoundException('Video not found');
    return p;
  }

  /** Uploaded avatars are private objects; only provider photos (e.g. Google) are public URLs. */
  private publicAvatar(c: { id: string; avatarUrl: string | null }): string | null {
    return c.avatarUrl && !c.avatarUrl.startsWith(avatarPrefix(c.id)) ? c.avatarUrl : null;
  }

  private async assertVisible(productId: string) {
    const found = await this.prisma.product.count({ where: { id: productId, ...VISIBLE } });
    if (!found) throw new NotFoundException('Video not found');
  }

  private toView(r: CommentRow): VideoCommentView {
    const { customer: c } = r;
    const shop = r.product.shop;
    return {
      id: r.id,
      parentId: r.parentId,
      body: r.deletedAt ? null : r.body,
      createdAt: r.createdAt,
      replyCount: r.replyCount,
      author: r.byShop
        ? { id: shop.id, name: shop.name, avatarUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null, isShop: true }
        : { id: c.id, name: c.name, avatarUrl: this.publicAvatar(c), isShop: false },
    };
  }
}

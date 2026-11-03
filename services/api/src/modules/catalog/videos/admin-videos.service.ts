import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductStatus } from '@talad/shared';
import type { AdminUser, Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { MediaService } from '../../media/media.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';

export const ADMIN_VIDEO_KINDS = ['customer', 'shop'] as const;
export type AdminVideoKind = (typeof ADMIN_VIDEO_KINDS)[number];

export interface AdminVideo {
  kind: AdminVideoKind;
  id: string;
  videoUrl: string;
  posterUrl: string | null;
  /** A customer's caption, or the product's name. */
  title: string;
  /** Who posted it: the customer or the shop. */
  owner: { id: string; name: string; contact: string | null };
  /** Shop videos: the product's status (a draft never reaches the feed). */
  productStatus: ProductStatus | null;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  hidden: boolean;
  hiddenReason: string | null;
  hiddenAt: Date | null;
  createdAt: Date;
}

const pages = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

/** Every video on the platform for the admin console: review them, hide them from customers. */
@Injectable()
export class AdminVideosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async list(kind: AdminVideoKind, filter: { q?: string; status?: string; customerId?: string; page: number; pageSize: number }) {
    const term = filter.q?.trim();
    const hidden = filter.status === 'hidden' ? true : filter.status === 'visible' ? false : undefined;
    const paging = { skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize };
    const paged = (items: AdminVideo[], total: number) => ({ items, page: filter.page, pageSize: filter.pageSize, total, totalPages: pages(total, filter.pageSize) });

    if (kind === 'customer') {
      const where: Prisma.FeedPostWhereInput = {
        ...(filter.customerId && { customerId: filter.customerId }),
        ...(hidden !== undefined && { isHidden: hidden }),
        ...(term && {
          OR: [
            { caption: { contains: term, mode: 'insensitive' } },
            { customer: { name: { contains: term, mode: 'insensitive' } } },
            { customer: { phone: { contains: term.replace(/\D/g, '') || term } } },
          ],
        }),
      };
      const [rows, total] = await Promise.all([
        this.prisma.feedPost.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          ...paging,
          include: { customer: { select: { id: true, name: true, phone: true, email: true } } },
        }),
        this.prisma.feedPost.count({ where }),
      ]);
      return paged(
        rows.map((p) => ({
          kind,
          id: p.id,
          videoUrl: this.media.publicUrl(p.videoKey),
          posterUrl: null,
          title: p.caption,
          owner: { id: p.customer.id, name: p.customer.name, contact: p.customer.phone ?? p.customer.email },
          productStatus: null,
          views: p.viewCount,
          likes: p.likeCount,
          comments: p.commentCount,
          shares: p.shareCount,
          hidden: p.isHidden,
          hiddenReason: p.hiddenReason,
          hiddenAt: p.hiddenAt,
          createdAt: p.createdAt,
        })),
        total,
      );
    }

    const where: Prisma.ProductWhereInput = {
      videoKey: { not: null },
      ...(hidden !== undefined && { videoHidden: hidden }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { shop: { name: { contains: term, mode: 'insensitive' } } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        ...paging,
        select: {
          id: true,
          name: true,
          status: true,
          videoKey: true,
          videoHidden: true,
          videoHiddenReason: true,
          videoHiddenAt: true,
          videoViewCount: true,
          videoShareCount: true,
          videoCommentCount: true,
          updatedAt: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
          shop: { select: { id: true, name: true, phone: true } },
          _count: { select: { wishlistBy: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);
    return paged(
      rows.map((p) => ({
        kind,
        id: p.id,
        videoUrl: this.media.publicUrl(p.videoKey!),
        posterUrl: p.images[0] ? this.media.publicUrl(p.images[0].key) : null,
        title: p.name,
        owner: { id: p.shop.id, name: p.shop.name, contact: p.shop.phone },
        productStatus: p.status,
        views: p.videoViewCount,
        likes: p._count.wishlistBy,
        comments: p.videoCommentCount,
        shares: p.videoShareCount,
        hidden: p.videoHidden,
        hiddenReason: p.videoHiddenReason,
        hiddenAt: p.videoHiddenAt,
        createdAt: p.updatedAt,
      })),
      total,
    );
  }

  /** Comments and replies, newest first, including ones their authors deleted (marked as such). */
  async comments(kind: AdminVideoKind, id: string, page: number, pageSize: number) {
    await this.assertExists(kind, id);
    const where: Prisma.VideoCommentWhereInput = kind === 'customer' ? { postId: id } : { productId: id };
    const [rows, total] = await Promise.all([
      this.prisma.videoComment.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { customer: { select: { id: true, name: true } } },
      }),
      this.prisma.videoComment.count({ where }),
    ]);
    return {
      items: rows.map((c) => ({ id: c.id, body: c.body, author: c.customer, byShop: c.byShop, isReply: c.parentId !== null, deleted: c.deletedAt !== null, createdAt: c.createdAt })),
      page,
      pageSize,
      total,
      totalPages: pages(total, pageSize),
    };
  }

  /** Who liked it (for a shop's product video, who saved the product). */
  async likes(kind: AdminVideoKind, id: string, page: number, pageSize: number) {
    await this.assertExists(kind, id);
    const paging = { orderBy: { createdAt: 'desc' as const }, skip: (page - 1) * pageSize, take: pageSize, include: { customer: { select: { id: true, name: true } } } };
    const [rows, total] =
      kind === 'customer'
        ? await Promise.all([this.prisma.feedPostLike.findMany({ where: { postId: id }, ...paging }), this.prisma.feedPostLike.count({ where: { postId: id } })])
        : await Promise.all([this.prisma.wishlistItem.findMany({ where: { productId: id }, ...paging }), this.prisma.wishlistItem.count({ where: { productId: id } })]);
    return { items: rows.map((l) => ({ customer: l.customer, createdAt: l.createdAt })), page, pageSize, total, totalPages: pages(total, pageSize) };
  }

  /** Hides a video from customers everywhere, or brings it back. The owner is told either way. */
  async setHidden(admin: AdminUser, kind: AdminVideoKind, id: string, hidden: boolean, reason: string | null, ip?: string) {
    const change = { reason: hidden ? reason : null, at: hidden ? new Date() : null };
    await this.prisma.$transaction(async (tx) => {
      if (kind === 'customer') {
        const post = await tx.feedPost.findUnique({ where: { id }, select: { customerId: true, caption: true } });
        if (!post) throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Video not found' });
        const { count } = await tx.feedPost.updateMany({ where: { id, isHidden: !hidden }, data: { isHidden: hidden, hiddenReason: change.reason, hiddenAt: change.at } });
        if (!count) throw new ConflictException({ code: 'VIDEO_CHANGED', message: 'This video was just updated' });
        await this.notifications.send(tx, post.customerId, 'SYSTEM', this.text(hidden, reason), { link: `/u/${post.customerId}` });
      } else {
        const product = await tx.product.findFirst({ where: { id, videoKey: { not: null } }, select: { shopId: true, name: true } });
        if (!product) throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Video not found' });
        const { count } = await tx.product.updateMany({ where: { id, videoHidden: !hidden }, data: { videoHidden: hidden, videoHiddenReason: change.reason, videoHiddenAt: change.at } });
        if (!count) throw new ConflictException({ code: 'VIDEO_CHANGED', message: 'This video was just updated' });
        await this.notifications.toShop(tx, product.shopId, 'ACTIVITY', this.text(hidden, reason, product.name), { link: '/videos' });
      }
      await this.audit.log({ adminId: admin.id, action: hidden ? 'video.hide' : 'video.unhide', entityType: kind === 'customer' ? 'FeedPost' : 'Product', entityId: id, changes: { reason }, ip }, tx);
    });
    return { hidden };
  }

  private text(hidden: boolean, reason: string | null, name?: string) {
    const lo = name ? `ວິດີໂອຂອງ ${name}` : 'ວິດີໂອຂອງທ່ານ';
    const en = name ? `The video of ${name}` : 'Your video';
    return hidden
      ? {
          lo: { title: `MC Mart ຊ່ອນ${lo}`, body: `ລູກຄ້າຈະບໍ່ເຫັນວິດີໂອນີ້ອີກ. ເຫດຜົນ: ${reason}` },
          en: { title: `MC Mart hid ${name ? en.toLowerCase() : 'your video'}`, body: `Customers no longer see it. Reason: ${reason}` },
        }
      : {
          lo: { title: `${lo} ກັບມາສະແດງແລ້ວ`, body: 'MC Mart ເປີດໃຫ້ລູກຄ້າເຫັນວິດີໂອນີ້ອີກຄັ້ງ.' },
          en: { title: `${en} is back`, body: 'MC Mart made it visible to customers again.' },
        };
  }

  private async assertExists(kind: AdminVideoKind, id: string) {
    const found = kind === 'customer' ? await this.prisma.feedPost.count({ where: { id } }) : await this.prisma.product.count({ where: { id, videoKey: { not: null } } });
    if (!found) throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Video not found' });
  }
}

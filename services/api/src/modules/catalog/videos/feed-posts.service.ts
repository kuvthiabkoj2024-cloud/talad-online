import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FEED_POST_RULES, MEDIA_LIMITS } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { avatarPrefix } from '../../auth/customer-auth.service.js';
import { MediaService } from '../../media/media.service.js';
import type { FeedPostItem } from '../products/products.service.js';
import { filePrefix, storageFolder } from '../../media/storage-keys.js';
import { StorageService } from '../../media/storage.service.js';
import { discardTempFile } from '../../media/temp-file-storage.js';
import { detectVideo } from '../../media/video-type.js';

/** A caption without control characters or runs of blank lines. */
const cleanCaption = (raw: string | undefined) =>
  (raw ?? '')
    // eslint-disable-next-line no-control-regex -- strips control characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, FEED_POST_RULES.captionMax);

/**
 * Customers' own feed videos (no product): post, delete, like, and the view / share counts.
 * They appear in the feed next to shops' product videos (ProductsService.feed).
 */
@Injectable()
export class FeedPostsService {
  private readonly logger = new Logger(FeedPostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}

  /** One post, for a shared link (the feed opens on it). */
  async one(postId: string): Promise<FeedPostItem> {
    const p = await this.prisma.feedPost.findFirst({
      where: { id: postId, isHidden: false, customer: { isActive: true } },
      include: { customer: { select: { id: true, name: true, avatarUrl: true } } },
    });
    if (!p) throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post not found' });
    const c = p.customer;
    return {
      kind: 'post',
      id: p.id,
      videoUrl: this.media.publicUrl(p.videoKey),
      caption: p.caption,
      createdAt: p.createdAt,
      author: { id: c.id, name: c.name, avatarUrl: c.avatarUrl && !c.avatarUrl.startsWith(avatarPrefix(c.id)) ? c.avatarUrl : null },
      stats: { views: p.viewCount, likes: p.likeCount, shares: p.shareCount },
    };
  }

  /** Stores the video (streamed from multer's temp file) and publishes the post. */
  async create(customerId: string, file: Express.Multer.File | undefined, caption: string | undefined) {
    try {
      if (!file) throw new BadRequestException({ code: 'INVALID_VIDEO', message: 'No video uploaded' });
      if (file.size > MEDIA_LIMITS.maxVideoBytes) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Video is too large' });
      const today = await this.prisma.feedPost.count({ where: { customerId, createdAt: { gt: new Date(Date.now() - 86_400_000) } } });
      if (today >= FEED_POST_RULES.perDay) throw new BadRequestException({ code: 'TOO_MANY_POSTS', message: 'Daily posting limit reached' });
      const head = Buffer.alloc(16);
      const handle = await open(file.path);
      await handle.read(head, 0, head.length, 0).finally(() => handle.close());
      const type = detectVideo(head);
      if (!type) throw new BadRequestException({ code: 'INVALID_VIDEO', message: 'Send an MP4, MOV or WebM video' });
      const videoKey = `${filePrefix(storageFolder.customerVideos(customerId), 'video')}${randomUUID()}.${type.ext}`;
      await this.storage.putFile(videoKey, file.path, type.type);
      const post = await this.prisma.feedPost.create({ data: { customerId, videoKey, caption: cleanCaption(caption) } });
      return { id: post.id };
    } finally {
      await discardTempFile(file?.path);
    }
  }

  /** Only the author deletes a post; its video file goes too. */
  async remove(customerId: string, postId: string) {
    const post = await this.prisma.feedPost.findUnique({ where: { id: postId }, select: { customerId: true, videoKey: true } });
    if (!post) throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post not found' });
    if (post.customerId !== customerId) throw new ForbiddenException({ code: 'NOT_YOURS', message: 'You can only delete your own posts' });
    await this.prisma.feedPost.delete({ where: { id: postId } });
    await this.storage.remove(post.videoKey).catch((e: unknown) => this.logger.warn(`Feed video not deleted: ${String(e)}`));
    return { ok: true };
  }

  async setLike(customerId: string, postId: string, like: boolean): Promise<{ liked: boolean; likes: number }> {
    await this.visible(postId);
    const likes = await this.prisma.$transaction(async (tx) => {
      const changed = like
        ? (await tx.feedPostLike.createMany({ data: [{ customerId, postId }], skipDuplicates: true })).count
        : (await tx.feedPostLike.deleteMany({ where: { customerId, postId } })).count;
      const post = changed
        ? await tx.feedPost.update({ where: { id: postId }, data: { likeCount: { increment: like ? 1 : -1 } }, select: { likeCount: true } })
        : await tx.feedPost.findUniqueOrThrow({ where: { id: postId }, select: { likeCount: true } });
      return Math.max(0, post.likeCount);
    });
    return { liked: like, likes };
  }

  async likedAmong(customerId: string, postIds: string[]): Promise<{ postIds: string[] }> {
    if (!postIds.length) return { postIds: [] };
    const rows = await this.prisma.feedPostLike.findMany({ where: { customerId, postId: { in: postIds } }, select: { postId: true } });
    return { postIds: rows.map((r) => r.postId) };
  }

  async view(postId: string): Promise<{ views: number }> {
    const post = await this.prisma.feedPost.update({ where: { id: postId }, data: { viewCount: { increment: 1 } }, select: { viewCount: true } }).catch(() => null);
    if (!post) throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post not found' });
    return { views: post.viewCount };
  }

  async share(postId: string): Promise<{ shares: number }> {
    const post = await this.prisma.feedPost.update({ where: { id: postId }, data: { shareCount: { increment: 1 } }, select: { shareCount: true } }).catch(() => null);
    if (!post) throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post not found' });
    return { shares: post.shareCount };
  }

  private async visible(postId: string) {
    const post = await this.prisma.feedPost.findFirst({ where: { id: postId, isHidden: false }, select: { id: true } });
    if (!post) throw new NotFoundException({ code: 'POST_NOT_FOUND', message: 'Post not found' });
  }
}

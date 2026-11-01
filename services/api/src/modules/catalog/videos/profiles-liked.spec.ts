import { describe, expect, it, vi } from 'vitest';
import { ProfilesService } from './profiles.service.js';

const at = (ms: number) => new Date(ms);
const post = (id: string, ms: number) => ({ createdAt: at(ms), post: { id, videoKey: `${id}.mp4`, caption: id, viewCount: 1, likeCount: 2, commentCount: 3, shareCount: 4 } });
const product = (id: string, ms: number) => ({
  createdAt: at(ms),
  product: { id, name: id, videoKey: `${id}.mp4`, videoViewCount: 5, videoCommentCount: 6, videoShareCount: 7, images: [{ key: 'cover.jpg' }], _count: { wishlistBy: 8 } },
});

function setup(posts: unknown[], products: unknown[]) {
  const prisma = {
    feedPostLike: { findMany: vi.fn().mockResolvedValue(posts), count: vi.fn().mockResolvedValue(posts.length) },
    wishlistItem: { findMany: vi.fn().mockResolvedValue(products), count: vi.fn().mockResolvedValue(products.length) },
  };
  return { prisma, service: new ProfilesService(prisma as never, { publicUrl: (k: string) => `cdn/${k}` } as never, {} as never) };
}

describe('liked videos', () => {
  it('merge customers’ posts and saved product videos, most recently liked first', async () => {
    const { service } = setup([post('a', 300), post('b', 100)], [product('c', 200)]);
    const page = await service.liked('me', undefined, 18);
    expect(page.items.map((v) => [v.kind, v.id])).toEqual([['post', 'a'], ['product', 'c'], ['post', 'b']]);
    expect(page.items[1]).toMatchObject({ posterUrl: 'cdn/cover.jpg', stats: { views: 5, likes: 8, comments: 6, shares: 7 } });
    expect(page.total).toBe(3);
    expect(page.nextCursor).toBeNull();
  });

  it('page on when they were liked', async () => {
    const { service, prisma } = setup([post('a', 300), post('b', 100)], [product('c', 200)]);
    const first = await service.liked('me', undefined, 2);
    expect(first.items.map((v) => v.id)).toEqual(['a', 'c']);
    expect(first.nextCursor).toBe('200.c');
    await service.liked('me', first.nextCursor!, 2);
    const where = prisma.feedPostLike.findMany.mock.calls[1][0].where;
    expect(where.OR).toEqual([{ createdAt: { lt: at(200) } }, { createdAt: at(200), postId: { lt: 'c' } }]);
  });

  it('leave out hidden, taken-down and closed videos, and only cover the viewer', async () => {
    const { service, prisma } = setup([], []);
    await service.liked('me', undefined, 18);
    expect(prisma.feedPostLike.findMany.mock.calls[0][0].where).toMatchObject({ customerId: 'me', post: { isHidden: false, customer: { isActive: true } } });
    expect(prisma.wishlistItem.findMany.mock.calls[0][0].where).toMatchObject({ customerId: 'me', product: { status: 'PUBLISHED', videoHidden: false, videoKey: { not: null }, shop: { status: 'APPROVED' } } });
  });
});

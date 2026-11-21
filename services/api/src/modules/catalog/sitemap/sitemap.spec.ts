import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { SITEMAP_MAX_PRODUCTS, SitemapService } from './sitemap.service.js';

const at = new Date('2026-11-20T00:00:00Z');

function setup() {
  const prisma = {
    product: { findMany: vi.fn().mockResolvedValue([{ slug: 'shirt', updatedAt: at, shop: { slug: 'anime' } }]) },
    shop: { findMany: vi.fn().mockResolvedValue([{ slug: 'anime', updatedAt: at }]) },
    category: { findMany: vi.fn().mockResolvedValue([{ slug: 'fashion', updatedAt: at }]) },
    cmsPage: { findMany: vi.fn().mockResolvedValue([{ slug: 'about', updatedAt: at }]) },
  };
  return { prisma, service: new SitemapService(prisma as unknown as PrismaService) };
}

describe('SitemapService', () => {
  it('lists only what visitors can open', async () => {
    const { prisma, service } = setup();
    await service.entries();
    expect(prisma.product.findMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'PUBLISHED', shop: { status: 'APPROVED' } },
      take: SITEMAP_MAX_PRODUCTS,
    });
    expect(prisma.shop.findMany.mock.calls[0][0]).toMatchObject({ where: { status: 'APPROVED' } });
    expect(prisma.category.findMany.mock.calls[0][0]).toMatchObject({ where: { isActive: true } });
  });

  it('gives products with their shop slug for the link', async () => {
    const { service } = setup();
    const out = await service.entries();
    expect(out.products).toEqual([{ shop: 'anime', slug: 'shirt', updatedAt: at }]);
    expect(out.pages).toEqual([{ slug: 'about', updatedAt: at }]);
  });

  it('stays within Google’s 50,000 links per sitemap in two languages', () => {
    expect(SITEMAP_MAX_PRODUCTS * 2).toBeLessThan(50_000);
  });
});

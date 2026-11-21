import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

/** Google reads at most 50,000 links per sitemap file; the storefront lists each in two languages. */
export const SITEMAP_MAX_PRODUCTS = 20_000;

export interface SitemapEntries {
  products: { shop: string; slug: string; updatedAt: Date }[];
  shops: { slug: string; updatedAt: Date }[];
  categories: { slug: string; updatedAt: Date }[];
  pages: { slug: string; updatedAt: Date }[];
}

/** What the storefront's sitemap.xml lists: only what a visitor can open (published, approved, active). */
@Injectable()
export class SitemapService {
  constructor(private readonly prisma: PrismaService) {}

  async entries(): Promise<SitemapEntries> {
    const [products, shops, categories, pages] = await Promise.all([
      this.prisma.product.findMany({
        where: { status: 'PUBLISHED', shop: { status: 'APPROVED' } },
        select: { slug: true, updatedAt: true, shop: { select: { slug: true } } },
        orderBy: { updatedAt: 'desc' },
        take: SITEMAP_MAX_PRODUCTS,
      }),
      this.prisma.shop.findMany({ where: { status: 'APPROVED' }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.category.findMany({ where: { isActive: true }, select: { slug: true, updatedAt: true }, orderBy: { slug: 'asc' } }),
      this.prisma.cmsPage.findMany({ select: { slug: true, updatedAt: true }, orderBy: { slug: 'asc' } }),
    ]);
    return {
      products: products.map((p) => ({ shop: p.shop.slug, slug: p.slug, updatedAt: p.updatedAt })),
      shops,
      categories,
      pages,
    };
  }
}

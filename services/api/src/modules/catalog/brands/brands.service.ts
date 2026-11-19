import { brandKey, cleanBrandName, slugify } from '@talad/shared';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

export interface BrandItem {
  slug: string;
  name: string;
  /** Visible products of this brand (in the category, when one was asked for). */
  productCount: number;
}

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Brands with products customers can see, most products first. `category`: only products in
   * that category (a top-level one includes its subcategories), for the category page's brand
   * filter. `q`: names containing it, for the product form's suggestions.
   */
  async list({ category, q, limit }: { category?: string; q?: string; limit: number }): Promise<BrandItem[]> {
    const term = q ? brandKey(q) : '';
    const pattern = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : null;
    const rows = await this.prisma.$queryRaw<{ slug: string; name: string; productCount: number }[]>`
      SELECT b.slug, b.name, COUNT(p.id)::int AS "productCount"
      FROM "Brand" b
      -- Suggestions (q) also list brands with no visible products yet; the filter only lists ones with products.
      ${pattern ? Prisma.sql`LEFT JOIN` : Prisma.sql`JOIN`} "Product" p ON p."brandId" = b.id AND p.status = 'PUBLISHED'
        AND EXISTS (SELECT 1 FROM "Shop" s WHERE s.id = p."shopId" AND s.status = 'APPROVED')
        ${
          category
            ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Category" c LEFT JOIN "Category" pc ON pc.id = c."parentId"
                WHERE c.id = p."categoryId" AND (c.slug = ${category} OR pc.slug = ${category}))`
            : Prisma.empty
        }
      ${pattern ? Prisma.sql`WHERE b.key ILIKE ${pattern}` : Prisma.empty}
      GROUP BY b.id
      ${pattern ? Prisma.empty : Prisma.sql`HAVING COUNT(p.id) > 0`}
      ORDER BY "productCount" DESC, b.name ASC
      LIMIT ${limit}`;
    return rows;
  }

  /**
   * The brand for a name a shop typed: the existing one (case and spaces ignored) or a new one.
   * Empty = no brand.
   */
  async resolve(name: string | null | undefined): Promise<string | null> {
    const clean = name ? cleanBrandName(name) : '';
    if (!clean) return null;
    const key = brandKey(clean);
    const existing = await this.prisma.brand.findUnique({ where: { key }, select: { id: true } });
    if (existing) return existing.id;
    const base = slugify(clean, 50) || 'brand';
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = attempt === 0 && base !== 'brand' ? base : `${base}-${Math.random().toString(36).slice(2, 7)}`;
      try {
        return (await this.prisma.brand.create({ data: { name: clean, key, slug }, select: { id: true } })).id;
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        // Another shop created the same brand at the same moment: use theirs.
        const raced = await this.prisma.brand.findUnique({ where: { key }, select: { id: true } });
        if (raced) return raced.id;
        // Otherwise the slug was taken by a different brand: try another.
      }
    }
    throw new Error('Could not create brand');
  }
}

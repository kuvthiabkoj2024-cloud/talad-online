import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MediaService } from '../../media/media.service.js';
import { flashPrice, FlashSalePricingService, type FlashDiscount } from '../../promotions/flash-sale-pricing.service.js';
import type { FeedQuery } from './feed.query.js';
import type { ListProductsQuery } from './list-products.query.js';

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  /** Lowest purchasable price (cheapest variant when the product has variants). */
  price: number;
  /** Highest variant price when it differs from `price`, otherwise null. */
  priceMax: number | null;
  compareAtPrice: number | null;
  imageUrl: string | null;
  soldCount: number;
  ratingAvg: number;
  shop: { slug: string; name: string };
  /** Set while the product is in a running flash sale; prices above are already discounted. */
  flashSale?: { percent: number; endsAt: Date } | null;
}

export interface FeedItem extends Omit<ProductCard, 'shop'> {
  videoUrl: string;
  shop: { slug: string; name: string; logoUrl: string | null };
}

export interface FeedPage {
  items: FeedItem[];
  /** Pass back as `cursor` for the next page; null on the last page. */
  nextCursor: string | null;
}

export interface ProductVariantOption {
  id: string;
  sku: string;
  /** Human-readable option label built from the attribute values, e.g. "L / Red". */
  label: string;
  attributes: Record<string, string>;
  price: number;
  /** Regular price while a flash sale discounts `price`; otherwise null. */
  regularPrice: number | null;
  stock: number;
}

export interface ProductDetail extends Omit<ProductCard, 'imageUrl'> {
  sku: string;
  description: string | null;
  stock: number;
  imageUrls: string[];
  ratingCount: number;
  variants: ProductVariantOption[];
  unit: { code: string; name: unknown };
  category: {
    slug: string;
    name: unknown;
    parent: { slug: string; name: unknown } | null;
  };
  shop: {
    id: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    verified: boolean;
    productCount: number;
  };
}

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  price: true,
  compareAtPrice: true,
  soldCount: true,
  ratingAvg: true,
  images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
  variants: { select: { price: true } },
  shop: { select: { slug: true, name: true } },
} satisfies Prisma.ProductSelect;

type CardRow = Prisma.ProductGetPayload<{ select: typeof cardSelect }>;

export const SHOP_PRODUCT_SORTS = ['popular', 'new', 'price_asc', 'price_desc'] as const;
export type ShopProductSort = (typeof SHOP_PRODUCT_SORTS)[number];

/** Lowest purchasable price: the cheapest variant, or the product price. */
const MIN_PRICE = Prisma.sql`COALESCE(
  (SELECT MIN(COALESCE(v.price, p.price)) FROM "ProductVariant" v WHERE v."productId" = p.id),
  p.price)`;

/** Whitelisted ORDER BY clauses — user input only ever selects a key. */
const SHOP_SORT_SQL: Record<ShopProductSort, Prisma.Sql> = {
  popular: Prisma.sql`p."isPinned" DESC, p."soldCount" DESC, p."viewCount" DESC, p.id DESC`,
  new: Prisma.sql`p."publishedAt" DESC NULLS LAST, p.id DESC`,
  price_asc: Prisma.sql`${MIN_PRICE} ASC, p.id ASC`,
  price_desc: Prisma.sql`${MIN_PRICE} DESC, p.id DESC`,
};

/** Only published products from approved shops are visible on the storefront. */
const VISIBLE = {
  status: 'PUBLISHED',
  shop: { status: 'APPROVED' },
} satisfies Prisma.ProductWhereInput;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly flash: FlashSalePricingService,
  ) {}

  /** Products in running flash sales (home page strip), biggest discount first. */
  async flashSale(limit = 24): Promise<{ endsAt: Date | null; items: ProductCard[] }> {
    const now = new Date();
    const items = await this.prisma.flashSaleItem.findMany({
      where: {
        product: VISIBLE,
        flashSale: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now }, shop: { status: 'APPROVED' } },
      },
      orderBy: [{ discountPercent: 'desc' }, { id: 'asc' }],
      take: limit * 2,
      select: { productId: true },
    });
    const ids = [...new Set(items.map((i) => i.productId))].slice(0, limit);
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids } }, select: cardSelect });
    const cards = await this.toCards(rows);
    cards.sort((a, b) => (b.flashSale?.percent ?? 0) - (a.flashSale?.percent ?? 0));
    const ends = cards.flatMap((c) => (c.flashSale ? [c.flashSale.endsAt.getTime()] : []));
    return { endsAt: ends.length ? new Date(Math.min(...ends)) : null, items: cards };
  }

  /** Published products for storefront listings (landing page, category/shop pages, related). */
  async list(query: ListProductsQuery): Promise<ProductCard[]> {
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      query.sort === 'new'
        ? [{ publishedAt: 'desc' }]
        : [{ isPinned: 'desc' }, { soldCount: 'desc' }, { viewCount: 'desc' }];

    const rows = await this.prisma.product.findMany({
      where: {
        ...VISIBLE,
        ...(query.category && { category: { OR: [{ slug: query.category }, { parent: { slug: query.category } }] } }),
        ...(query.shop && { shop: { ...VISIBLE.shop, slug: query.shop } }),
        ...(query.exclude && { id: { not: query.exclude } }),
      },
      orderBy,
      take: query.limit,
      select: cardSelect,
    });
    return this.toCards(rows);
  }

  /** Visible products that have a video, newest first, cursor-paged for infinite scroll. */
  async feed(query: FeedQuery): Promise<FeedPage> {
    const rows = await this.prisma.product.findMany({
      where: { ...VISIBLE, videoKey: { not: null } },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor && { cursor: { id: query.cursor }, skip: 1 }),
      select: { ...cardSelect, videoKey: true, shop: { select: { slug: true, name: true, logoUrl: true } } },
    });
    const page = rows.slice(0, query.limit);
    const discounts = await this.flash.discounts(page.map((r) => r.id));
    return {
      items: page.map(({ videoKey, shop, ...row }) => ({
        ...this.toCard({ ...row, shop }, discounts.get(row.id)),
        videoUrl: this.media.publicUrl(videoKey!),
        shop: {
          slug: shop.slug,
          name: shop.name,
          logoUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null,
        },
      })),
      nextCursor: rows.length > query.limit ? page[page.length - 1].id : null,
    };
  }

  /**
   * One page of a shop's products, searched and sorted in SQL. Price sorts use the
   * real lowest price (cheapest variant), matching what the cards show.
   */
  async searchShop(shopId: string, q: string | undefined, sort: ShopProductSort, page: number, pageSize: number) {
    const term = q?.trim();
    // Escape LIKE wildcards; the value itself is always a bound parameter.
    const pattern = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : null;
    const where = Prisma.sql`
      p."shopId" = ${shopId} AND p.status = 'PUBLISHED'
      ${pattern ? Prisma.sql`AND (p.name ILIKE ${pattern} OR p.sku ILIKE ${pattern})` : Prisma.empty}`;

    const [ids, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM "Product" p
        WHERE ${where}
        ORDER BY ${SHOP_SORT_SQL[sort]}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`
        SELECT COUNT(*)::int AS total FROM "Product" p WHERE ${where}`,
    ]);

    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: cardSelect,
    });
    const cards = new Map((await this.toCards(rows)).map((c) => [c.id, c]));
    const items = ids.flatMap(({ id }) => (cards.has(id) ? [cards.get(id)!] : []));
    return { items, page, pageSize, total, hasMore: page * pageSize < total };
  }

  private async toCards(rows: CardRow[]): Promise<ProductCard[]> {
    const discounts = await this.flash.discounts(rows.map((r) => r.id));
    return rows.map((r) => this.toCard(r, discounts.get(r.id)));
  }

  private toCard({ images, variants, price, compareAtPrice, ratingAvg, ...row }: CardRow, flash?: FlashDiscount): ProductCard {
    const range = priceRange(
      price.toNumber(),
      variants.map((v) => v.price?.toNumber() ?? null),
    );
    return {
      ...row,
      ...withFlash(range, compareAtPrice?.toNumber() ?? null, flash),
      ratingAvg: ratingAvg.toNumber(),
      imageUrl: images[0] ? this.media.publicUrl(images[0].key) : null,
    };
  }

  /** Full product for the product detail page. */
  async findBySlug(shopSlug: string, slug: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: { ...VISIBLE, slug, shop: { ...VISIBLE.shop, slug: shopSlug } },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: { sku: 'asc' } },
        unit: { select: { code: true, name: true } },
        category: {
          select: {
            slug: true,
            name: true,
            parent: { select: { slug: true, name: true } },
          },
        },
        shop: {
          select: {
            id: true,
            slug: true,
            name: true,
            logoUrl: true,
            verifiedAt: true,
            _count: { select: { products: { where: { status: 'PUBLISHED' } } } },
          },
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const flash = (await this.flash.discounts([product.id])).get(product.id);
    const base = product.price.toNumber();
    const variants = product.variants.map((v) => {
      const attributes = v.attributes as Record<string, string>;
      const price = v.price?.toNumber() ?? base;
      return {
        id: v.id,
        sku: v.sku,
        label: Object.values(attributes).join(' / '),
        attributes,
        price: flash ? flashPrice(price, flash.percent) : price,
        regularPrice: flash ? price : null,
        stock: v.stock,
      };
    });
    const { shop } = product;

    return {
      id: product.id,
      slug: product.slug,
      sku: product.sku,
      name: product.name,
      description: product.description,
      ...withFlash(
        priceRange(
          base,
          product.variants.map((v) => v.price?.toNumber() ?? null),
        ),
        product.compareAtPrice?.toNumber() ?? null,
        flash,
      ),
      stock: variants.length
        ? variants.reduce((sum, v) => sum + v.stock, 0)
        : product.stock,
      soldCount: product.soldCount,
      ratingAvg: product.ratingAvg.toNumber(),
      ratingCount: product.ratingCount,
      imageUrls: product.images.map((i) => this.media.publicUrl(i.key)),
      variants,
      unit: product.unit,
      category: product.category,
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        logoUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null,
        verified: shop.verifiedAt !== null,
        productCount: shop._count.products,
      },
    };
  }
}

/**
 * Price shown for a product: its own price, or — when it has variants — the range
 * across variants (a variant without its own price uses the product price).
 */
export function priceRange(
  base: number,
  variantPrices: (number | null)[],
): { price: number; priceMax: number | null } {
  if (variantPrices.length === 0) return { price: base, priceMax: null };
  const prices = variantPrices.map((p) => p ?? base);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return { price: min, priceMax: max > min ? max : null };
}

/**
 * Prices with a running flash sale applied. The regular price becomes the crossed-out
 * "compare at" price (unless the product's own compare-at price is higher).
 */
export function withFlash(
  range: { price: number; priceMax: number | null },
  compareAtPrice: number | null,
  flash?: FlashDiscount,
): { price: number; priceMax: number | null; compareAtPrice: number | null; flashSale: { percent: number; endsAt: Date } | null } {
  if (!flash) return { ...range, compareAtPrice, flashSale: null };
  return {
    price: flashPrice(range.price, flash.percent),
    priceMax: range.priceMax === null ? null : flashPrice(range.priceMax, flash.percent),
    compareAtPrice: Math.max(compareAtPrice ?? 0, range.priceMax ?? range.price),
    flashSale: { percent: flash.percent, endsAt: flash.endsAt },
  };
}

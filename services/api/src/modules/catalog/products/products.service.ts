import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MediaService } from '../../media/media.service.js';
import { flashPrice, FlashSalePricingService, type FlashDiscount } from '../../promotions/flash-sale-pricing.service.js';
import { feedPostInclude, toFeedPost } from '../videos/feed-posts.service.js';
import type { FeedQuery } from './feed.query.js';
import { productOptions, variantLabel, type ProductOption } from './product-options.js';
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
  kind: 'product';
  videoUrl: string;
  shop: { id: string; slug: string; name: string; logoUrl: string | null };
  /** Units available (all variants together). */
  stock: number;
  hasVariants: boolean;
  stats: { views: number; favorites: number; comments: number; shares: number };
}

/** A customer's own video in the feed (no product to buy). */
export interface FeedPostItem {
  kind: 'post';
  id: string;
  videoUrl: string;
  caption: string;
  createdAt: Date;
  author: { id: string; name: string; avatarUrl: string | null };
  stats: { views: number; likes: number; comments: number; shares: number };
}

export interface FeedPage {
  items: (FeedItem | FeedPostItem)[];
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
  /** The product's short video (§2.5), shown first in the gallery; null without one. */
  videoUrl: string | null;
  ratingCount: number;
  /** What the variants differ by (e.g. Colour, then Size), values in the seller's order. */
  options: ProductOption[];
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

/** A product video in the feed: the card plus its stock, numbers and shop. */
const feedSelect = {
  ...cardSelect,
  publishedAt: true,
  videoKey: true,
  stock: true,
  variants: { select: { price: true, stock: true } },
  videoViewCount: true,
  videoShareCount: true,
  videoCommentCount: true,
  _count: { select: { wishlistBy: true } },
  shop: { select: { id: true, slug: true, name: true, logoUrl: true } },
} satisfies Prisma.ProductSelect;

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

/** Joins and text the storefront search looks in: product, shop and category names (both languages). */
const SEARCH_JOINS = Prisma.sql`
  JOIN "Shop" s ON s.id = p."shopId"
  JOIN "Category" c ON c.id = p."categoryId"
  LEFT JOIN "Category" pc ON pc.id = c."parentId"`;
const SEARCHABLE = Prisma.sql`concat_ws(' ', p.name, p.description, p.sku, s.name, c.name->>'lo', c.name->>'en', pc.name->>'lo', pc.name->>'en')`;
/** ILIKE pattern with wildcards escaped; always passed as a bound parameter. */
const like = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`;

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

  /**
   * The feed: shops' product videos and customers' own videos, newest first, cursor-paged
   * for infinite scroll. The cursor is "<ms>.<id>" of the last item; a bare product id (older
   * clients) still works.
   */
  async feed(query: FeedQuery): Promise<FeedPage> {
    const at = await this.feedCursor(query.cursor);
    // Strictly after the cursor in (time desc, id desc) order.
    const before = (field: 'publishedAt' | 'createdAt') =>
      at ? { OR: [{ [field]: { lt: at.time } }, { [field]: at.time, id: { lt: at.id } }] } : {};
    const [rows, posts] = await Promise.all([
      this.prisma.product.findMany({
        where: { ...VISIBLE, videoKey: { not: null }, ...before('publishedAt') },
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        select: feedSelect,
      }),
      this.prisma.feedPost.findMany({
        where: { isHidden: false, customer: { isActive: true }, ...before('createdAt') },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        include: feedPostInclude,
      }),
    ]);
    const merged = [
      ...rows.map((r) => ({ time: r.publishedAt!, id: r.id, product: r, post: undefined })),
      ...posts.map((p) => ({ time: p.createdAt, id: p.id, product: undefined, post: p })),
    ].sort((a, b) => b.time.getTime() - a.time.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
    const page = merged.slice(0, query.limit);
    const discounts = await this.flash.discounts(page.flatMap((e) => (e.product ? [e.product.id] : [])));
    const last = page.at(-1);
    return {
      items: page.map((e): FeedItem | FeedPostItem => {
        if (e.post) return toFeedPost(this.media, e.post);
        return this.toFeedItem(e.product!, discounts.get(e.product!.id));
      }),
      nextCursor: merged.length > query.limit && last ? `${last.time.getTime()}.${last.id}` : null,
    };
  }

  /** One product video, for a link to it (a notification, a share): the feed opens on it. */
  async feedVideo(productId: string): Promise<FeedItem> {
    const row = await this.prisma.product.findFirst({ where: { id: productId, ...VISIBLE, videoKey: { not: null } }, select: feedSelect });
    if (!row) throw new NotFoundException({ code: 'VIDEO_NOT_FOUND', message: 'Video not found' });
    return this.toFeedItem(row, (await this.flash.discounts([row.id])).get(row.id));
  }

  private toFeedItem(product: Prisma.ProductGetPayload<{ select: typeof feedSelect }>, discount?: FlashDiscount): FeedItem {
    const { videoKey, shop, stock, videoViewCount, videoShareCount, videoCommentCount, _count, publishedAt: _publishedAt, ...row } = product;
    return {
      kind: 'product',
      ...this.toCard({ ...row, shop }, discount),
      videoUrl: this.media.publicUrl(videoKey!),
      shop: {
        id: shop.id,
        slug: shop.slug,
        name: shop.name,
        logoUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null,
      },
      stock: row.variants.length ? row.variants.reduce((sum, v) => sum + v.stock, 0) : stock,
      hasVariants: row.variants.length > 0,
      stats: { views: videoViewCount, favorites: _count.wishlistBy, comments: videoCommentCount, shares: videoShareCount },
    };
  }

  /** Where the previous page ended: "<ms>.<id>", or a bare product id from older clients. */
  private async feedCursor(cursor?: string): Promise<{ time: Date; id: string } | null> {
    if (!cursor) return null;
    const [ms, id] = cursor.split('.');
    if (id && /^\d+$/.test(ms)) return { time: new Date(Number(ms)), id };
    const product = await this.prisma.product.findUnique({ where: { id: cursor }, select: { publishedAt: true } });
    return product?.publishedAt ? { time: product.publishedAt, id: cursor } : null;
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

  /** Storefront search (§5): every word must match the name, description, SKU, shop or category (Lao or English). */
  async search(q: string, page: number, pageSize: number) {
    const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (!words.length) return { items: [], page, pageSize, total: 0, hasMore: false };
    const where = Prisma.sql`p.status = 'PUBLISHED' AND s.status = 'APPROVED' AND ${Prisma.join(
      words.map((w) => Prisma.sql`(${SEARCHABLE}) ILIKE ${like(w)}`),
      ' AND ',
    )}`;
    const [ids, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM "Product" p ${SEARCH_JOINS}
        WHERE ${where}
        ORDER BY (p.name ILIKE ${like(words.join(' '))}) DESC, p."isPinned" DESC, p."soldCount" DESC, p.id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM "Product" p ${SEARCH_JOINS} WHERE ${where}`,
    ]);
    return { items: await this.cardsByIds(ids.map((r) => r.id)), page, pageSize, total, hasMore: page * pageSize < total };
  }

  /**
   * Visible products matching any of `keywords` (photo search), best first: a keyword in the
   * name counts double, and products in `category` (or its subcategories) get a bonus.
   */
  async keywordMatches(keywords: string[], category: string | null, limit: number, shopId?: string): Promise<{ productId: string; hits: number }[]> {
    if (!keywords.length && !category) return [];
    const scores = keywords.map(
      (k) => Prisma.sql`(CASE WHEN p.name ILIKE ${like(k)} THEN 2 WHEN (${SEARCHABLE}) ILIKE ${like(k)} THEN 1 ELSE 0 END)`,
    );
    const inCategory = category ? Prisma.sql`(CASE WHEN c.slug = ${category} OR pc.slug = ${category} THEN 1 ELSE 0 END)` : Prisma.sql`0`;
    const score = Prisma.sql`(${scores.length ? Prisma.join(scores, ' + ') : Prisma.sql`0`} + ${inCategory})`;
    const rows = await this.prisma.$queryRaw<{ id: string; hits: number }[]>`
      SELECT p.id, ${score}::int AS hits FROM "Product" p ${SEARCH_JOINS}
      WHERE p.status = 'PUBLISHED' AND s.status = 'APPROVED' AND ${score} > 0 ${shopId ? Prisma.sql`AND p."shopId" = ${shopId}` : Prisma.empty}
      ORDER BY hits DESC, p."soldCount" DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({ productId: r.id, hits: r.hits }));
  }

  /**
   * Visible products matching every group (any alternative within a group), best sellers
   * first — e.g. [["food", "ອາຫານ"], ["cat", "ແມວ"]] finds cat food in either language.
   * `shopId`: only that shop's products (its chat bot).
   */
  async matchAll(groups: string[][], limit: number, shopId?: string): Promise<string[]> {
    const usable = groups.map((g) => g.filter((w) => w.trim())).filter((g) => g.length);
    if (!usable.length) return [];
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM "Product" p ${SEARCH_JOINS}
      WHERE p.status = 'PUBLISHED' AND s.status = 'APPROVED' ${shopId ? Prisma.sql`AND p."shopId" = ${shopId}` : Prisma.empty} AND ${Prisma.join(
        usable.map((g) => Prisma.sql`(${Prisma.join(g.map((w) => Prisma.sql`(${SEARCHABLE}) ILIKE ${like(w)}`), ' OR ')})`),
        ' AND ',
      )}
      ORDER BY p."isPinned" DESC, p."soldCount" DESC, p.id DESC
      LIMIT ${limit}`;
    return rows.map((r) => r.id);
  }

  /** Cards for `ids`, in that order (missing or hidden ones are skipped). */
  async cardsByIds(ids: string[]): Promise<ProductCard[]> {
    if (!ids.length) return [];
    const rows = await this.prisma.product.findMany({ where: { id: { in: ids }, ...VISIBLE }, select: cardSelect });
    const cards = new Map((await this.toCards(rows)).map((c) => [c.id, c]));
    return ids.flatMap((id) => (cards.has(id) ? [cards.get(id)!] : []));
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
    const options = productOptions(product.options, product.variants);
    const variants = product.variants.map((v) => {
      const attributes = v.attributes as Record<string, string>;
      const price = v.price?.toNumber() ?? base;
      return {
        id: v.id,
        sku: v.sku,
        label: variantLabel(options, attributes),
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
      options,
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
      videoUrl: product.videoKey ? this.media.publicUrl(product.videoKey) : null,
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

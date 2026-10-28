import "server-only";

export const API_URL = process.env.API_URL ?? "http://localhost:4000/api/v1";

/**
 * Server-side GET against the marketplace API. Returns `null` when the API
 * is unreachable so storefront sections can render an empty state instead of
 * failing the whole page.
 */
export async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export type LocalizedText = Partial<Record<"lo" | "en", string>>;

export interface CategoryNode {
  id: string;
  slug: string;
  name: LocalizedText;
  iconUrl: string | null;
  imageUrl: string | null;
  children: CategoryNode[];
}

/** Mirrors `ProductCard` from services/api catalog/products. */
export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  /** Lowest price; `priceMax` is set when variants make it a range. */
  price: number;
  priceMax: number | null;
  compareAtPrice: number | null;
  imageUrl: string | null;
  soldCount: number;
  ratingAvg: number;
  shop: { slug: string; name: string };
  /** Set while in a running flash sale; prices are already discounted. */
  flashSale?: { percent: number; endsAt: string } | null;
}

export interface ProductVariantOption {
  id: string;
  sku: string;
  label: string;
  attributes: Record<string, string>;
  price: number;
  /** Regular price while a flash sale discounts `price`. */
  regularPrice: number | null;
  stock: number;
}

/** Mirrors `ProductDetail` from services/api catalog/products. */
export interface ProductDetail extends Omit<ProductCard, "imageUrl" | "shop"> {
  sku: string;
  description: string | null;
  stock: number;
  imageUrls: string[];
  /** The product's short video, shown first in the gallery; null without one. */
  videoUrl: string | null;
  ratingCount: number;
  /** What the variants differ by (e.g. Colour, then Size), values in the shop's order. */
  options: { name: string; values: string[] }[];
  variants: ProductVariantOption[];
  unit: { code: string; name: LocalizedText };
  category: {
    slug: string;
    name: LocalizedText;
    parent: { slug: string; name: LocalizedText } | null;
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

/** Query for `/products` listings. */
export interface ProductQuery {
  sort?: "popular" | "new";
  category?: string;
  shop?: string;
  exclude?: string;
  limit?: number;
}

export function listProducts(query: ProductQuery): Promise<ProductCard[] | null> {
  const params = new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  return apiGet<ProductCard[]>(`/products?${params}`);
}

/** Mirrors `FeedItem` from services/api catalog/products: a shop's product video. */
export interface FeedItem extends Omit<ProductCard, "shop"> {
  kind?: "product";
  videoUrl: string;
  shop: { id: string; slug: string; name: string; logoUrl: string | null };
  /** Units available (all options together). */
  stock: number;
  hasVariants: boolean;
  stats: VideoStats;
}

/** Mirrors `VideoStats` from services/api catalog/videos. Favorites = customers who saved the product. */
export interface VideoStats {
  views: number;
  favorites: number;
  comments: number;
  shares: number;
}

/** Mirrors `VideoCommentView` from services/api catalog/videos. */
export interface VideoComment {
  id: string;
  parentId: string | null;
  /** Null once deleted (kept while it still has replies). */
  body: string | null;
  createdAt: string;
  replyCount: number;
  /** `isShop`: the shop answering (its name and logo). */
  author: { id: string; name: string; avatarUrl: string | null; isShop: boolean };
}

export interface VideoCommentPage {
  items: VideoComment[];
  nextCursor: string | null;
}

/** Mirrors `FeedPostItem`: a customer's own video (no product to buy). */
export interface FeedPostItem {
  kind: "post";
  id: string;
  videoUrl: string;
  caption: string;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
  stats: PostStats;
}

export interface PostStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

/** What a comment sheet is about: a shop's product video or a customer's post. */
export type CommentTarget = { kind: "product" | "post"; id: string };

/** Mirrors `CustomerProfileView` from services/api catalog/videos. */
export interface CustomerProfile {
  id: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string;
  followers: number;
  following: number;
  videos: number;
  likes: number;
}

export interface ProfileVideoPage {
  items: FeedPostItem[];
  nextCursor: string | null;
}

export interface ProfileFollowerPage {
  items: { id: string; name: string; avatarUrl: string | null; followedAt: string }[];
  nextCursor: string | null;
  total: number;
}

/** One screen of the feed. */
export type FeedEntry = FeedItem | FeedPostItem;

export interface FeedPage {
  items: FeedEntry[];
  nextCursor: string | null;
}

export function feedPath(cursor?: string): string {
  return cursor ? `/products/feed?cursor=${encodeURIComponent(cursor)}` : "/products/feed";
}

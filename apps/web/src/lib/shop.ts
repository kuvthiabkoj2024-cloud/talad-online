import type { ProductCard } from "./api";

/** Mirrors the public shop profile (services/api shops module). */
export interface PublicShop {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  productCount: number;
  ratingAvg: number;
  ratingCount: number;
  /** Customers following the shop. */
  followerCount: number;
  joinedAt: string;
}

export const SHOP_SORTS = ["popular", "new", "price_asc", "price_desc"] as const;
export type ShopSort = (typeof SHOP_SORTS)[number];

export function isShopSort(value: unknown): value is ShopSort {
  return typeof value === "string" && (SHOP_SORTS as readonly string[]).includes(value);
}

export interface ShopProductPage {
  items: ProductCard[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export const SHOP_PAGE_SIZE = 12;

export function shopProductsPath(slug: string, { q, sort, page }: { q?: string; sort: ShopSort; page: number }) {
  const params = new URLSearchParams({ sort, page: String(page), pageSize: String(SHOP_PAGE_SIZE) });
  if (q) params.set("q", q);
  return `/shops/${encodeURIComponent(slug)}/products?${params}`;
}

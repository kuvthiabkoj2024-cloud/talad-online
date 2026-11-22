import type { BusinessHours, FreeDeliveryOffer } from "@talad/shared";
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
  /** Free urgent delivery within this distance of the shop (null: not offered). */
  freeDelivery: FreeDeliveryOffer | null;
  /** Opening hours per weekday (days left out are closed); empty when not set. */
  businessHours: BusinessHours;
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

/** Brand slugs as the API makes them (anything else is ignored). */
export const isBrandSlug = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9-]{1,60}$/.test(v);

export function shopProductsPath(slug: string, { q, sort, page, brand }: { q?: string; sort: ShopSort; page: number; brand?: string }) {
  const params = new URLSearchParams({ sort, page: String(page), pageSize: String(SHOP_PAGE_SIZE) });
  if (q) params.set("q", q);
  if (brand) params.set("brand", brand);
  return `/shops/${encodeURIComponent(slug)}/products?${params}`;
}

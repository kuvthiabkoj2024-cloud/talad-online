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
}

export interface ProductVariantOption {
  id: string;
  sku: string;
  label: string;
  attributes: Record<string, string>;
  price: number;
  stock: number;
}

/** Mirrors `ProductDetail` from services/api catalog/products. */
export interface ProductDetail extends Omit<ProductCard, "imageUrl" | "shop"> {
  sku: string;
  description: string | null;
  stock: number;
  imageUrls: string[];
  ratingCount: number;
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

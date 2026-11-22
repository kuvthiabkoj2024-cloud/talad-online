"use server";

import { apiGet } from "./api";
import { isBrandSlug, isShopSort, shopProductsPath, type ShopProductPage, type ShopSort } from "./shop";

/** Next page of a shop's products for "Load more". Public data; inputs are re-validated by the API. */
export async function loadShopProducts(
  slug: string,
  input: { q?: string; sort: ShopSort; page: number; brand?: string },
): Promise<ShopProductPage | null> {
  if (!isShopSort(input.sort) || !Number.isInteger(input.page) || input.page < 1) return null;
  const brand = isBrandSlug(input.brand) ? input.brand : undefined;
  return apiGet<ShopProductPage>(shopProductsPath(slug, { ...input, brand, q: input.q?.slice(0, 100) }));
}

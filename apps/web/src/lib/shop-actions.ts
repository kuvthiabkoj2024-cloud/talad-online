"use server";

import { apiGet } from "./api";
import { isShopSort, shopProductsPath, type ShopProductPage, type ShopSort } from "./shop";

/** Next page of a shop's products for "Load more". Public data; inputs are re-validated by the API. */
export async function loadShopProducts(
  slug: string,
  input: { q?: string; sort: ShopSort; page: number },
): Promise<ShopProductPage | null> {
  if (!isShopSort(input.sort) || !Number.isInteger(input.page) || input.page < 1) return null;
  return apiGet<ShopProductPage>(shopProductsPath(slug, { ...input, q: input.q?.slice(0, 100) }));
}

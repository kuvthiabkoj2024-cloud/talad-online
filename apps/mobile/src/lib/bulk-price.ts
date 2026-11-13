import { bulkUnitPrice, flashPrice, tierFor, type PriceTier } from '@talad/shared';

export interface BulkPricing {
  basePrice: number;
  tiers: PriceTier[];
}

/** Price per unit for `quantity` of an option whose single price is `regular`: bulk first, then any flash sale (as the cart charges). */
export function bulkPrice(bulk: BulkPricing, regular: number, quantity: number, flashPercent: number | null): number {
  const price = bulkUnitPrice(bulk.basePrice, regular, bulk.tiers, quantity);
  return flashPercent === null ? price : flashPrice(price, flashPercent);
}

/** Rows of the "buy more, pay less" table (1–9, 10–19, 20+…), with whether `quantity` is in each. */
export function bulkRows(bulk: BulkPricing, regular: number, quantity: number, flashPercent: number | null) {
  const reached = tierFor(bulk.tiers, quantity);
  const starts = [1, ...bulk.tiers.map((t) => t.minQuantity)];
  return starts.map((from, i) => ({
    from,
    to: i + 1 < starts.length ? starts[i + 1] - 1 : null,
    price: bulkPrice(bulk, regular, from, flashPercent),
    active: (reached?.minQuantity ?? 1) === from,
  }));
}

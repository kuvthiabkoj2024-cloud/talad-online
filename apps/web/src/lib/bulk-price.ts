import { bulkUnitPrice, flashPrice, tierFor, type PriceTier } from "@talad/shared";

export interface BulkPricing {
  basePrice: number;
  tiers: PriceTier[];
}

/**
 * Price per unit when buying `quantity` of an option whose regular single price is `regular`,
 * the way the cart charges it: the bulk price first, then any flash sale's percent off.
 */
export function bulkPrice(bulk: BulkPricing, regular: number, quantity: number, flashPercent: number | null): number {
  const price = bulkUnitPrice(bulk.basePrice, regular, bulk.tiers, quantity);
  return flashPercent === null ? price : flashPrice(price, flashPercent);
}

/** The rows of a "buy more, pay less" table: 1–9, 10–19, 20+… with the price each and whether `quantity` is in it. */
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

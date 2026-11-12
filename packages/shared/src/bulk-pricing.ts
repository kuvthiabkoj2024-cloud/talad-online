/**
 * Bulk (quantity) pricing: a shop sets a lower price per unit when a customer buys more,
 * e.g. 1 shirt 120,000 ₭, from 10 shirts 100,000 ₭ each. Checked by the Seller Center and the
 * API, and used to price the cart, checkout and the product page alike.
 */

/** From `minQuantity` units of the product, each costs `price`. */
export interface PriceTier {
  minQuantity: number;
  price: number;
}

export const PRICE_TIER_RULES = {
  maxTiers: 5,
  /** Buying one is the product's own price, so tiers start at 2. */
  minQuantity: 2,
  maxQuantity: 100_000,
} as const;

export type PriceTierProblem = 'quantity' | 'quantityOrder' | 'price' | 'priceOrder' | 'tooMany';

/**
 * What's wrong with a product's tiers, or null. Tiers must be in order of quantity, each for
 * more units and cheaper than the one before, and every one cheaper than `basePrice`.
 */
export function priceTierProblem(basePrice: number, tiers: PriceTier[]): PriceTierProblem | null {
  if (tiers.length > PRICE_TIER_RULES.maxTiers) return 'tooMany';
  let quantity = 1;
  let price = basePrice;
  for (const t of tiers) {
    if (!Number.isInteger(t.minQuantity) || t.minQuantity < PRICE_TIER_RULES.minQuantity || t.minQuantity > PRICE_TIER_RULES.maxQuantity) return 'quantity';
    if (t.minQuantity <= quantity) return 'quantityOrder';
    if (!(t.price > 0)) return 'price';
    if (t.price >= price) return t.price >= basePrice ? 'price' : 'priceOrder';
    quantity = t.minQuantity;
    price = t.price;
  }
  return null;
}

/** The tier `quantity` units reach (the biggest one at or under it), or null. */
export function tierFor(tiers: readonly PriceTier[], quantity: number): PriceTier | null {
  let best: PriceTier | null = null;
  for (const t of tiers) if (quantity >= t.minQuantity && (!best || t.minQuantity > best.minQuantity)) best = t;
  return best;
}

/**
 * Price per unit when buying `quantity` units, in whole kip. `unitPrice` is the chosen option's
 * own price and `basePrice` the product's: an option priced differently gets the same share
 * off (a 150,000 ₭ option with tier 120,000 → 100,000 costs 125,000).
 */
export function bulkUnitPrice(basePrice: number, unitPrice: number, tiers: readonly PriceTier[], quantity: number): number {
  const tier = tierFor(tiers, quantity);
  if (!tier || basePrice <= 0) return unitPrice;
  if (unitPrice === basePrice) return tier.price;
  return Math.round((unitPrice * tier.price) / basePrice);
}

/** Sale price for `price` at `percent` off, in whole kip (flash sales, §3.4). */
export const flashPrice = (price: number, percent: number) => Math.round((price * (100 - percent)) / 100);

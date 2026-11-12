import type { PriceTier } from '@talad/shared';

/** A product's saved bulk prices (the `priceTiers` jsonb), in quantity order; [] when it has none. */
export function readPriceTiers(json: unknown): PriceTier[] {
  if (!Array.isArray(json)) return [];
  return json
    .flatMap((t: unknown) => {
      const { minQuantity, price } = (t ?? {}) as Record<string, unknown>;
      return typeof minQuantity === 'number' && typeof price === 'number' ? [{ minQuantity, price }] : [];
    })
    .sort((a, b) => a.minQuantity - b.minQuantity);
}

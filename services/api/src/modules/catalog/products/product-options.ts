/** A product's options (what its variants differ by) and how a variant is labelled. */

export interface ProductOption {
  name: string;
  values: string[];
}

/**
 * A product's options in order: as saved, or (older products) worked out from its variants —
 * names from the first variant, values in the order they appear.
 */
export function productOptions(saved: unknown, variants: { attributes: unknown }[]): ProductOption[] {
  if (Array.isArray(saved) && saved.every((o) => o && typeof o.name === 'string' && Array.isArray(o.values))) return saved as ProductOption[];
  const attrs = variants.map((v) => (v.attributes ?? {}) as Record<string, string>);
  if (!attrs.length) return [];
  return Object.keys(attrs[0]).map((name) => ({ name, values: [...new Set(attrs.map((a) => a[name]).filter((x): x is string => typeof x === 'string'))] }));
}

/** "Red / M": a variant's values in option order. */
export const variantLabel = (options: ProductOption[], attributes: Record<string, string>) =>
  (options.length ? options.map((o) => attributes[o.name]).filter(Boolean) : Object.values(attributes)).join(' / ');

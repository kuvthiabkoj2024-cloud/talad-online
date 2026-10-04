import { formatMoney, type Locale } from "@talad/shared";

/** "₭55,000" or "₭55,000 - ₭180,000" when the product has a price range. */
export function formatPriceRange(
  price: number,
  priceMax: number | null,
  locale: Locale,
): string {
  const min = formatMoney(price, locale);
  return priceMax ? `${min} - ${formatMoney(priceMax, locale)}` : min;
}

const LOCALE_TAGS: Record<Locale, string> = { lo: "lo-LA", en: "en-US" };

/** Short counts for tight spaces: 820 → "820", 1250 → "1.3K". */
export function formatCount(n: number, locale: Locale): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}

/** Fills `{name}` placeholders in dictionary strings. */
export function interpolate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Picks the current locale from a `{ lo, th, en }` JSON field, falling back to English. */
export function localized(
  text: Partial<Record<Locale, string>>,
  locale: Locale,
  fallback = "",
): string {
  return text[locale] ?? text.en ?? fallback;
}

export function productPath(locale: Locale, shopSlug: string, slug: string): string {
  return `/${locale}/p/${shopSlug}/${slug}`;
}

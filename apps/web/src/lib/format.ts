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
  // Built by hand, not Intl "compact": Node and browsers disagree for Lao ("1,2 ພັນ" vs
  // "1.2K"), and these render on the server and again in the browser (hydration).
  const units = locale === "lo" ? ([[1e6, " ລ້ານ"], [1e3, " ພັນ"]] as const) : ([[1e6, "M"], [1e3, "K"]] as const);
  for (const [size, unit] of units) {
    if (Math.abs(n) >= size) return `${Math.floor((n / size) * 10) / 10}${unit}`;
  }
  return n.toLocaleString("en-US");
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

/** "Just now", "5 min ago", "3 days ago" — for comment timestamps. */
export function formatRelativeTime(iso: string, locale: Locale, justNow: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 60) return justNow;
  const rtf = new Intl.RelativeTimeFormat(LOCALE_TAGS[locale], { numeric: "auto" });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [["year", 31_536_000], ["month", 2_592_000], ["week", 604_800], ["day", 86_400], ["hour", 3_600], ["minute", 60]];
  const [unit, size] = units.find(([, s]) => Math.abs(seconds) >= s)!;
  return rtf.format(Math.round(seconds / size), unit);
}

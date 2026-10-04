export const LOCALES = ['lo', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'lo';

export const DEFAULT_CURRENCY = 'LAK';

const LOCALE_TAGS: Record<Locale, string> = {
  lo: 'lo-LA',
  en: 'en-US',
};

/** Format a minor-unit-free LAK amount (LAK has no subunit in practice). */
export function formatMoney(
  amount: number,
  locale: Locale = DEFAULT_LOCALE,
  currency: string = DEFAULT_CURRENCY,
): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: 'currency',
    currency,
    // "₭95,000" in every locale (en would otherwise render "LAK 95,000")
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(amount);
}

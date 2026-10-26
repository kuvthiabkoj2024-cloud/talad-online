export const LOCALES = ['lo', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'lo';

export const DEFAULT_CURRENCY = 'LAK';

/**
 * Number style for amounts: "95,000" in every language. Not the Lao locale's own data: Node
 * (full ICU) groups Lao numbers with dots ("95.000") while browsers use commas, so a page
 * rendered on the server would no longer match in the browser (React hydration error).
 */
const AMOUNT_TAG = 'en-US';

/** Format a minor-unit-free LAK amount (LAK has no subunit in practice): "₭95,000". */
export function formatMoney(
  amount: number,
  _locale: Locale = DEFAULT_LOCALE,
  currency: string = DEFAULT_CURRENCY,
): string {
  return new Intl.NumberFormat(AMOUNT_TAG, {
    style: 'currency',
    currency,
    // "₭95,000" in every locale (en would otherwise render "LAK 95,000")
    currencyDisplay: 'narrowSymbol',
    maximumFractionDigits: 0,
  }).format(amount);
}

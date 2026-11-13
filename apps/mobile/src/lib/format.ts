import type { Locale } from '@talad/shared';

/**
 * "₭95,000", as on the website. Built by hand: the phone's JS engine (Hermes) doesn't
 * reliably support Intl's `narrowSymbol` currency display, which would show "LAK 95,000".
 */
export function money(amount: number): string {
  return `₭${Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

export const priceRange = (price: number, priceMax: number | null) => (priceMax ? `${money(price)} - ${money(priceMax)}` : money(price));

/** "1.2K" / "1.2 ພັນ", like the website. */
export function count(n: number, locale: Locale): string {
  const units = locale === 'lo' ? ([[1e6, ' ລ້ານ'], [1e3, ' ພັນ']] as const) : ([[1e6, 'M'], [1e3, 'K']] as const);
  for (const [size, unit] of units) {
    if (Math.abs(n) >= size) return `${Math.floor((n / size) * 10) / 10}${unit}`;
  }
  return String(n);
}

const MONTHS: Record<Locale, string[]> = {
  lo: ['ມ.ກ.', 'ກ.ພ.', 'ມ.ນ.', 'ມ.ສ.', 'ພ.ພ.', 'ມິ.ຖ.', 'ກ.ລ.', 'ສ.ຫ.', 'ກ.ຍ.', 'ຕ.ລ.', 'ພ.ຈ.', 'ທ.ວ.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** "4 ພ.ຈ. 2026" / "4 Nov 2026". */
export function date(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[locale][d.getMonth()]} ${d.getFullYear()}`;
}

/** "4 ພ.ຈ. 2026 14:05" / "4 Nov 2026 14:05". */
export function dateTime(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return `${date(iso, locale)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

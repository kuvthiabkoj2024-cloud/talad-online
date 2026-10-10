import { formatMoney, type Locale } from '@talad/shared'
import type { LocalizedText } from './types'

export { formatMoney }

const TAGS: Record<Locale, string> = { lo: 'lo-LA', en: 'en-GB' }

export function priceRange(price: number, priceMax: number | null, locale: Locale): string {
  const min = formatMoney(price, locale)
  return priceMax ? `${min} – ${formatMoney(priceMax, locale)}` : min
}

export function formatDate(iso: string, locale: Locale, withTime = false): string {
  return new Intl.DateTimeFormat(TAGS[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime && { hour: '2-digit', minute: '2-digit' }),
  }).format(new Date(iso))
}

export function formatNumber(n: number, locale: Locale): string {
  return new Intl.NumberFormat(TAGS[locale]).format(n)
}

export function localized(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.en ?? Object.values(text)[0] ?? ''
}

/** Fills `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}

const STOREFRONT = (import.meta.env.VITE_STOREFRONT_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export const storefrontUrl = {
  shop: (locale: Locale, slug: string) => `${STOREFRONT}/${locale}/s/${slug}`,
  product: (locale: Locale, shop: string, slug: string) => `${STOREFRONT}/${locale}/p/${shop}/${slug}`,
  terms: (locale: Locale) => `${STOREFRONT}/${locale}/pages/terms`,
}

/** `<input type="datetime-local">` value in the browser's timezone. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

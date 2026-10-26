import { formatMoney, type Locale } from '@talad/shared'
import type { LocalizedText } from './types'

export { formatMoney }

const TAGS: Record<Locale, string> = { lo: 'lo-LA', en: 'en-GB' }

export function formatDate(iso: string, locale: Locale, withTime = false): string {
  return new Intl.DateTimeFormat(TAGS[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime && { hour: '2-digit', minute: '2-digit' }),
  }).format(new Date(iso))
}

/**
 * Numbers read "2,000,000" in every language and browser: Lao locale data differs between
 * browsers (some group with dots), so amounts and counts use one fixed style.
 */
const NUMBER_TAG = 'en-US'

export function formatNumber(n: number, _locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_TAG).format(n)
}

export function compactNumber(n: number, _locale: Locale): string {
  return new Intl.NumberFormat(NUMBER_TAG, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function localized(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) return ''
  return text[locale] ?? text.en ?? text.lo ?? Object.values(text)[0] ?? ''
}

/** Fills `{name}` placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m))
}

/** `<input type="datetime-local">` value in the browser's timezone. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const STOREFRONT = (import.meta.env.VITE_STOREFRONT_URL ?? 'http://localhost:3000').replace(/\/$/, '')

export const storefrontUrl = {
  shop: (locale: Locale, slug: string) => `${STOREFRONT}/${locale}/s/${slug}`,
  product: (locale: Locale, shop: string, slug: string) => `${STOREFRONT}/${locale}/p/${shop}/${slug}`,
  page: (locale: Locale, slug: string) => `${STOREFRONT}/${locale}/pages/${slug}`,
  /** Root-relative assets (e.g. courier logos in the web app's public/) resolve against the storefront. */
  asset: (url: string) => (url.startsWith('/') ? `${STOREFRONT}${url}` : url),
}

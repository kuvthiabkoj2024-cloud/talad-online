import { DEFAULT_LOCALE, LOCALES, type Locale } from '@talad/shared'
import { useEffect, useMemo, useState } from 'react'
import { I18nContext } from './context'
import { en } from './en'
import { lo } from './lo'

const DICTS = { lo, en }
const KEY = 'talad_seller_locale'

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale
  } catch {
    // Storage blocked: fall back to the default.
  }
  return DEFAULT_LOCALE
}

/** Lao by default (like the storefront); the choice is remembered on this device. */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
    try {
      localStorage.setItem(KEY, locale)
    } catch {
      // Not persisted; fine.
    }
  }, [locale])

  const value = useMemo(() => ({ locale, t: DICTS[locale], setLocale }), [locale])
  return <I18nContext value={value}>{children}</I18nContext>
}

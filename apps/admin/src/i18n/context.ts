import { DEFAULT_LOCALE, type Locale } from '@talad/shared'
import { createContext, useContext } from 'react'
import type { Dict } from './en'
import { lo } from './lo'

export interface I18n {
  locale: Locale
  t: Dict
  setLocale: (locale: Locale) => void
}

export const I18nContext = createContext<I18n>({ locale: DEFAULT_LOCALE, t: lo, setLocale: () => {} })

/** Current language and its strings: `const { t, locale } = useI18n()`. */
export function useI18n(): I18n {
  return useContext(I18nContext)
}

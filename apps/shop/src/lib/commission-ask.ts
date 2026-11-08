import { COMMISSION_RULES, formatMoney, type CommissionType, type Locale } from '@talad/shared'
import type { Dict } from '@/i18n/en'
import { fill } from '@/lib/format'

/** A commission request as typed in (value as text). */
export interface CommissionAsk {
  type: CommissionType
  value: string
  reason: string
}

export const emptyAsk = (): CommissionAsk => ({ type: 'PERCENT', value: '', reason: '' })

/** What's wrong with the rate typed in, or null. */
export function askProblem(ask: CommissionAsk, t: Dict, locale: Locale): string | null {
  const n = Number(ask.value)
  const max = ask.type === 'PERCENT' ? COMMISSION_RULES.percentMax : COMMISSION_RULES.fixedMax
  if (ask.value.trim() === '' || !Number.isFinite(n) || n < 0 || n > max) {
    return fill(t.commission.invalid, { max: ask.type === 'PERCENT' ? `${max}%` : formatMoney(max, locale) })
  }
  return null
}

/** The request as the API takes it. */
export const askBody = (ask: CommissionAsk) => ({ type: ask.type, value: Number(ask.value), reason: ask.reason.trim() || undefined })

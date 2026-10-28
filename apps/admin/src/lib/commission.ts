import type { Commission, CommissionType, Locale } from '@talad/shared'
import { formatMoney } from '@/lib/format'

/** What the form holds: the type and the value as typed ('' = no commission at this level). */
export interface CommissionDraft {
  type: CommissionType
  value: string
}

export const draftOf = (c: Commission | null): CommissionDraft => ({ type: c?.type ?? 'PERCENT', value: c ? String(c.value) : '' })

/** The commission to save; null when the value is empty (the next level applies). */
export const commissionFrom = (d: CommissionDraft): Commission | null => (d.value.trim() === '' ? null : { type: d.type, value: Number(d.value) })

/** "5%" or "₭50,000 / unit". */
export function commissionLabel(c: Commission, locale: Locale, perUnit: string): string {
  return c.type === 'PERCENT' ? `${c.value}%` : `${formatMoney(c.value, locale)} ${perUnit}`
}

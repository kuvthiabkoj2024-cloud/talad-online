import type { Dict } from '@/i18n/en'
import { ApiError } from '@/lib/api'

const KNOWN = ['INVALID_CREDENTIALS', 'ACCOUNT_DISABLED', 'TWO_FACTOR_INVALID', 'CHALLENGE_EXPIRED', 'CAPTCHA_REQUIRED', 'CAPTCHA_FAILED'] as const

/** What to show for a failed sign-in or reset request. */
export function errorText(e: unknown, t: Dict): string {
  if (e instanceof ApiError && e.status === 429) return t.auth.throttled
  const code = e instanceof ApiError ? e.code : undefined
  return code && (KNOWN as readonly string[]).includes(code) ? t.auth[code as (typeof KNOWN)[number]] : t.auth.generic
}

/**
 * Machine-readable auth error codes. Clients translate these; `message` is an
 * English fallback for logs and API consumers.
 */
export type AuthErrorCode =
  | 'INVALID_PHONE'
  | 'PHONE_REGISTERED'
  | 'PHONE_NOT_REGISTERED'
  | 'OTP_COOLDOWN'
  | 'OTP_EXPIRED'
  | 'OTP_INVALID'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_TOKEN_INVALID'
  | 'ACCOUNT_DISABLED'
  | 'UNAUTHENTICATED';

export function authError(
  code: AuthErrorCode,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return { code, message, ...extra };
}

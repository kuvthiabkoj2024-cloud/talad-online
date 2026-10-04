/**
 * Lao mobile numbers. Accepts what people actually type — "020 5555 1234",
 * "2055551234", "+856 20 5555 1234" — and normalizes to E.164 ("+8562055551234").
 * Mobile ranges: 20 + 8 digits, and the older 30 + 7 digits.
 */
const LAO_MOBILE = /^(20\d{8}|30\d{7})$/;

export const PHONE_COUNTRY_CODE = '+856';

/** Returns the E.164 form, or null when the input is not a valid Lao mobile number. */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, '');
  if (digits.startsWith('+856')) digits = digits.slice(4);
  else if (digits.startsWith('00856')) digits = digits.slice(5);
  else if (digits.startsWith('856') && digits.length > 10) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return LAO_MOBILE.test(digits) ? `${PHONE_COUNTRY_CODE}${digits}` : null;
}

/** "+8562055551234" → "+856 20 5555 1234" for display. */
export function formatPhone(e164: string): string {
  const local = e164.startsWith(PHONE_COUNTRY_CODE) ? e164.slice(4) : e164;
  const match = /^(\d{2})(\d{3,4})(\d{4})$/.exec(local);
  return match ? `${PHONE_COUNTRY_CODE} ${match[1]} ${match[2]} ${match[3]}` : e164;
}

/** Length of a one-time sign-in code. */
export const OTP_LENGTH = 6;

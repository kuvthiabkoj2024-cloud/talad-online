import { base32Decode, base32Encode, generateTotpSecret, totpAt, verifyTotp } from './totp.js';

// RFC 6238 appendix B test secret ("12345678901234567890"), SHA-1, 8 digits truncated to the last 6.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp', () => {
  it('round-trips base32', () => {
    const buf = Buffer.from('hello authenticator');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it('matches the RFC 6238 vectors', () => {
    expect(totpAt(RFC_SECRET, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(RFC_SECRET, Math.floor(1111111109 / 30))).toBe('081804');
    expect(totpAt(RFC_SECRET, Math.floor(1234567890 / 30))).toBe('005924');
  });

  it('accepts codes one step either side and rejects others', () => {
    const secret = generateTotpSecret();
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, step - 1), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, step + 1), now)).toBe(true);
    expect(verifyTotp(secret, totpAt(secret, step + 3), now)).toBe(false);
    expect(verifyTotp(secret, 'abc123', now)).toBe(false);
  });
});

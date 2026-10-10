import { createHmac, timingSafeEqual } from 'node:crypto';

/** Second-step sign-in tickets: signed, short-lived, and bound to one actor kind. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type Actor = 'customer' | 'admin';
export type ChallengeMethod = 'TOTP' | 'SMS';

const sign = (secret: string, actor: Actor, payload: string) => createHmac('sha256', secret).update(`2fa:${actor}:${payload}`).digest('base64url');

export function signChallenge(secret: string, actor: Actor, id: string, method: ChallengeMethod, expiresAt: Date): string {
  const payload = Buffer.from(`${id}.${expiresAt.getTime()}.${method}`).toString('base64url');
  return `${payload}.${sign(secret, actor, payload)}`;
}

/** The ticket's contents, or null when it is forged, for another actor kind, or expired. */
export function readChallenge(secret: string, actor: Actor, challenge: string): { id: string; exp: number; method: ChallengeMethod } | null {
  const [payload, sig] = challenge.split('.');
  if (!payload || !sig) return null;
  const expected = sign(secret, actor, payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [id, exp, method] = Buffer.from(payload, 'base64url').toString().split('.');
  if (!(Number(exp) > Date.now()) || (method !== 'TOTP' && method !== 'SMS')) return null;
  return { id, exp: Number(exp), method };
}

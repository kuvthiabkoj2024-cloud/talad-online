/** Mirrors `CustomerProfile` from services/api auth. Safe to import from client components. */
export interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** External photo (e.g. Google); used when nothing was uploaded. */
  avatarUrl: string | null;
  /** Set when the customer uploaded a photo. */
  avatarVersion: string | null;
  createdAt: string;
  linked: { google: boolean; apple: boolean };
  /** The shop this account owns — accounts can buy and sell. */
  shop: { id: string; slug: string; name: string; status: "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED" } | null;
}

/** Seller Center (apps/shop) — shop owners sign in there with this same account. */
export const SELLER_CENTER_URL = process.env.NEXT_PUBLIC_SHOP_URL ?? "http://localhost:5174";

/** Where an account applies to open a shop (Seller Center asks it to sign in first). */
export const OPEN_SHOP_URL = `${SELLER_CENTER_URL.replace(/\/$/, "")}/register`;

/** Image URL for a customer's photo: uploaded (served via /api/avatars) or external. */
export function avatarSrc(c: Pick<CustomerProfile, "id" | "avatarUrl" | "avatarVersion">): string | null {
  return c.avatarVersion ? `/api/avatars/${c.id}?v=${c.avatarVersion}` : c.avatarUrl;
}

export type AuthErrorCode =
  | "INVALID_PHONE"
  | "PHONE_REGISTERED"
  | "PHONE_NOT_REGISTERED"
  | "OTP_COOLDOWN"
  | "OTP_EXPIRED"
  | "OTP_INVALID"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_TOKEN_INVALID"
  | "ACCOUNT_DISABLED"
  | "TWO_FACTOR_INVALID"
  | "CHALLENGE_EXPIRED"
  | "nameRequired"
  | "generic";

export type AuthResult<T> = ({ ok: true } & T) | { ok: false; error: AuthErrorCode; retryAfter?: number };

/** Only allow same-site relative redirects after sign-in (no open redirects). */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : fallback;
}

/** Up to two initials for avatar placeholders. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
}

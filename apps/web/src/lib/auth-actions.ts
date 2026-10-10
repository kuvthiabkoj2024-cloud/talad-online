"use server";

import { cookies } from "next/headers";
import { API_URL } from "./api";
import type { AuthErrorCode, AuthResult, CustomerProfile } from "./customer";
import { SESSION_COOKIE } from "./session";

type Flow = "login" | "register";

interface SignInResponse {
  token: string;
  expiresAt: string;
  customer: CustomerProfile;
}

/** Accounts with an authenticator app get this instead of a session (see verifyTwoFactor). */
export interface TwoFactorChallenge {
  method: "TOTP" | "SMS";
  challenge: string;
}

type SignInOrChallenge = SignInResponse | { twoFactor: TwoFactorChallenge };
type SignInResult = AuthResult<{ customer: CustomerProfile; twoFactor?: undefined } | { twoFactor: TwoFactorChallenge; customer?: undefined }>;

async function finish(result: AuthResult<{ data: SignInOrChallenge }>): Promise<SignInResult> {
  if (!result.ok) return result;
  if ("twoFactor" in result.data) return { ok: true, twoFactor: result.data.twoFactor };
  await startSession(result.data);
  return { ok: true, customer: result.data.customer };
}

const KNOWN_ERRORS = new Set<AuthErrorCode>([
  "INVALID_PHONE",
  "PHONE_REGISTERED",
  "PHONE_NOT_REGISTERED",
  "OTP_COOLDOWN",
  "OTP_EXPIRED",
  "OTP_INVALID",
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_TOKEN_INVALID",
  "ACCOUNT_DISABLED",
  "TWO_FACTOR_INVALID",
  "CHALLENGE_EXPIRED",
]);

async function post<T>(path: string, body: unknown, token?: string): Promise<AuthResult<{ data: T }>> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    const code = json?.code as AuthErrorCode | undefined;
    return {
      ok: false,
      error: code && KNOWN_ERRORS.has(code) ? code : "generic",
      retryAfter: typeof json?.retryAfter === "number" ? json.retryAfter : undefined,
    };
  } catch {
    return { ok: false, error: "generic" };
  }
}

async function startSession({ token, expiresAt }: SignInResponse) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

/** Step 1: send an SMS code for sign-in or sign-up. */
export async function requestOtp(input: {
  flow: Flow;
  phone: string;
  name?: string;
}): Promise<AuthResult<{ phone: string; resendAfterSeconds: number; devCode?: string }>> {
  if (input.flow === "register" && !input.name?.trim()) return { ok: false, error: "nameRequired" };
  const result = await post<{ phone: string; resendAfterSeconds: number; devCode?: string }>(
    "/auth/customer/otp/request",
    input,
  );
  return result.ok ? { ok: true, ...result.data } : result;
}

/** Step 2: verify the code; on success the session cookie is set. */
export async function verifyOtp(input: {
  flow: Flow;
  phone: string;
  code: string;
  name?: string;
}): Promise<SignInResult> {
  return finish(await post<SignInOrChallenge>("/auth/customer/otp/verify", input));
}

/** Second step for accounts with an authenticator app; on success the session cookie is set. */
export async function verifyTwoFactor(challenge: string, code: string): Promise<SignInResult> {
  return finish(await post<SignInOrChallenge>("/auth/customer/2fa/verify", { challenge, code }));
}

/** Google / Apple: exchange the provider's ID token for a session. */
export async function socialSignIn(
  provider: "google" | "apple",
  idToken: string,
  name?: string,
): Promise<SignInResult> {
  return finish(await post<SignInOrChallenge>(`/auth/customer/${provider}`, { idToken, name }));
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await post("/auth/customer/logout", {}, token);
  store.delete(SESSION_COOKIE);
}

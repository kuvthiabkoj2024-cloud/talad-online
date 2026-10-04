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
}): Promise<AuthResult<{ customer: CustomerProfile }>> {
  const result = await post<SignInResponse>("/auth/customer/otp/verify", input);
  if (!result.ok) return result;
  await startSession(result.data);
  return { ok: true, customer: result.data.customer };
}

/** Google / Apple: exchange the provider's ID token for a session. */
export async function socialSignIn(
  provider: "google" | "apple",
  idToken: string,
  name?: string,
): Promise<AuthResult<{ customer: CustomerProfile }>> {
  const result = await post<SignInResponse>(`/auth/customer/${provider}`, { idToken, name });
  if (!result.ok) return result;
  await startSession(result.data);
  return { ok: true, customer: result.data.customer };
}

export async function logout(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await post("/auth/customer/logout", {}, token);
  store.delete(SESSION_COOKIE);
}

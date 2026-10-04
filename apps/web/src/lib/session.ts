import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { API_URL } from "./api";
import type { CustomerProfile } from "./customer";

/** httpOnly cookie holding the opaque API session token. */
export const SESSION_COOKIE = "talad_session";

export async function getSessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/** GET an API resource as the signed-in customer. Null when signed out, not found or unreachable. */
export async function apiGetAsCustomer<T>(path: string): Promise<T | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** POST to the API as the signed-in customer (for reads that take a body, e.g. a checkout quote). */
export async function apiPostAsCustomer<T>(path: string, body: unknown): Promise<T | null> {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** The signed-in customer for this request, or null. Deduplicated per request. */
export const getCurrentCustomer = cache(async (): Promise<CustomerProfile | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/auth/customer/me`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    return res.ok ? ((await res.json()) as CustomerProfile) : null;
  } catch {
    return null;
  }
});

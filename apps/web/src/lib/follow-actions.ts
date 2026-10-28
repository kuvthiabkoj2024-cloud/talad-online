"use server";

import { API_URL } from "./api";
import { getSessionToken } from "./session";

/** Following shops and other customers: state, follow / unfollow, and the shops a customer follows. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface FollowState {
  following: boolean;
  followers: number;
}

export interface FollowedShop {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  verified: boolean;
  productCount: number;
  followers: number;
  followedAt: string;
}

export type FollowResult = ({ ok: true } & FollowState) | { ok: false; error: "UNAUTHENTICATED" | "OWN_SHOP" | "generic" };

async function call<T>(method: "GET" | "PUT" | "DELETE", path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; code?: string }> {
  const token = await getSessionToken();
  if (!token) return { ok: false, status: 401 };
  try {
    const res = await fetch(`${API_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const json = await res.json().catch(() => null);
    return res.ok ? { ok: true, data: json as T } : { ok: false, status: res.status, code: json?.code };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Whether the signed-in customer follows this shop; null when signed out. */
export async function followState(shopId: string): Promise<FollowState | null> {
  if (!UUID.test(shopId)) return null;
  const res = await call<FollowState>("GET", `/me/follows/${shopId}`);
  return res.ok ? res.data : null;
}

export async function setFollow(shopId: string, follow: boolean): Promise<FollowResult> {
  if (!UUID.test(shopId)) return { ok: false, error: "generic" };
  const res = await call<FollowState>(follow ? "PUT" : "DELETE", `/me/follows/${shopId}`);
  if (res.ok) return { ok: true, ...res.data };
  if (res.status === 401) return { ok: false, error: "UNAUTHENTICATED" };
  return { ok: false, error: res.code === "OWN_SHOP" ? "OWN_SHOP" : "generic" };
}

/** Which of these shops the signed-in customer follows (empty when signed out). */
export async function followedShops(shopIds: string[]): Promise<string[]> {
  const ids = Array.isArray(shopIds) ? shopIds.filter((id) => UUID.test(id)).slice(0, 50) : [];
  if (!ids.length) return [];
  const res = await call<{ shopIds: string[] }>("GET", `/me/follows/status?ids=${ids.join(",")}`);
  return res.ok ? res.data.shopIds : [];
}

/* ── Following other customers (their profile and feed videos) ── */

export type ProfileFollowResult = ({ ok: true } & FollowState) | { ok: false; error: "UNAUTHENTICATED" | "generic" };

export async function setProfileFollow(customerId: string, follow: boolean): Promise<ProfileFollowResult> {
  if (!UUID.test(customerId)) return { ok: false, error: "generic" };
  const res = await call<FollowState>(follow ? "PUT" : "DELETE", `/me/profile-follows/${customerId}`);
  if (res.ok) return { ok: true, ...res.data };
  return { ok: false, error: res.status === 401 ? "UNAUTHENTICATED" : "generic" };
}

/** Which of these customers the signed-in customer follows (empty when signed out). */
export async function followedProfiles(customerIds: string[]): Promise<string[]> {
  const ids = Array.isArray(customerIds) ? customerIds.filter((id) => UUID.test(id)).slice(0, 50) : [];
  if (!ids.length) return [];
  const res = await call<{ customerIds: string[] }>("GET", `/me/profile-follows/status?ids=${ids.join(",")}`);
  return res.ok ? res.data.customerIds : [];
}

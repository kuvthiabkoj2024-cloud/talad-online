"use server";

import type { PushSubscriptionBody } from "@/lib/web-push";
import { API_URL } from "./api";
import { getSessionToken } from "./session";

/** The API's VAPID public key; null while Web Push is off. */
export async function getPushPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/push/config`, { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { publicKey: string | null }).publicKey;
  } catch {
    return null;
  }
}

async function call(method: "PUT" | "DELETE", body: unknown): Promise<void> {
  const token = await getSessionToken();
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${API_URL}/me/push-subscription`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Push subscription ${method} failed (${res.status})`);
}

/** This browser gets the signed-in customer's notifications and chat replies. */
export async function savePushSubscription(body: PushSubscriptionBody): Promise<void> {
  await call("PUT", body);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  if (typeof endpoint !== "string") return;
  await call("DELETE", { endpoint });
}

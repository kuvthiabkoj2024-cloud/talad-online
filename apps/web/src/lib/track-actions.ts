"use server";

import { API_URL } from "./api";
import { clientHeaders } from "./client-headers";
import type { TrackedOrder } from "./orders";

export type TrackResult = { ok: true; order: TrackedOrder } | { ok: false; error: "notFound" | "tooMany" | "error" };

/** Order tracking needs no sign-in: the order number and a phone number on the order. */
export async function trackOrder(number: string, phone: string): Promise<TrackResult> {
  if (!number.trim() || !phone.trim()) return { ok: false, error: "notFound" };
  try {
    const res = await fetch(`${API_URL}/orders/track`, {
      method: "POST",
      headers: { ...(await clientHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ number: number.trim().slice(0, 40), phone: phone.trim().slice(0, 30) }),
      cache: "no-store",
    });
    if (res.ok) return { ok: true, order: (await res.json()) as TrackedOrder };
    if (res.status === 429) return { ok: false, error: "tooMany" };
    // 400 (too short to be a number or a phone) reads the same as no match.
    return { ok: false, error: res.status === 404 || res.status === 400 ? "notFound" : "error" };
  } catch {
    return { ok: false, error: "error" };
  }
}

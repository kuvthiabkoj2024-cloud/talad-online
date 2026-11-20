"use server";

import { API_URL } from "./api";
import { clientHeaders } from "./client-headers";
import { getSessionToken } from "./session";

/**
 * Promotions and MC Mart news by push / SMS, on or off (orders and chats always come). The
 * same setting as the app's Profile → Notifications.
 */
export async function setPromotions(on: boolean): Promise<{ ok: boolean }> {
  if (typeof on !== "boolean") return { ok: false };
  const token = await getSessionToken();
  if (!token) return { ok: false };
  try {
    const res = await fetch(`${API_URL}/me/notification-settings`, {
      method: "PUT",
      headers: { ...(await clientHeaders()), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ promotions: on }),
      cache: "no-store",
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}

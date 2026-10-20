"use server";

import type { Locale } from "@talad/shared";
import { API_URL, type ProductCard } from "./api";
import { getSessionToken } from "./session";

export interface ChatProduct extends ProductCard {
  /** False for "related" suggestions. */
  exact: boolean;
}

/** Mirrors `ChatReply` from services/api catalog/chat. */
export interface ChatReply {
  reply: string;
  products: ChatProduct[];
  quality: "exact" | "related" | "none";
  suggestions: string[];
  engine: "ai" | "basic";
  /** The language the customer chats in (labels follow it, not the app language). */
  lang: Locale;
  /** Buy by chat: an order card the customer completes in the chat. */
  orderId?: string;
}

export type ChatError = "THROTTLED" | "INVALID_IMAGE" | "FILE_TOO_LARGE" | "IMAGE_SEARCH_UNAVAILABLE" | "generic";

/** One Market Chat turn: the message (and optional photo) plus earlier turns for context. */
export async function sendChat(form: FormData): Promise<{ ok: true; data: ChatReply } | { ok: false; error: ChatError }> {
  const body = new FormData();
  body.set("message", String(form.get("message") ?? "").slice(0, 500));
  body.set("history", String(form.get("history") ?? "[]"));
  body.set("locale", (form.get("locale") as Locale | null) ?? "lo");
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) body.set("photo", photo, photo.name || "photo.jpg");
  const thumb = form.get("thumb");
  if (typeof thumb === "string" && thumb.length < 80_000) body.set("thumb", thumb);
  // Signed in: the API keeps this conversation in the customer's account (private to them).
  const token = await getSessionToken();
  try {
    const res = await fetch(`${API_URL}/chat`, { method: "POST", body, cache: "no-store", headers: token ? { Authorization: `Bearer ${token}` } : undefined });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as ChatReply };
    if (res.status === 429) return { ok: false, error: "THROTTLED" };
    const code = json?.code as ChatError | undefined;
    return { ok: false, error: code && ["INVALID_IMAGE", "FILE_TOO_LARGE", "IMAGE_SEARCH_UNAVAILABLE"].includes(code) ? code : "generic" };
  } catch {
    return { ok: false, error: "generic" };
  }
}

/** Saved message of a signed-in customer's Market Chat (mirrors the API's history). */
export interface SavedChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  image?: string;
  products?: ChatProduct[];
  lang?: Locale;
  orderId?: string;
}

/** "New chat" for a signed-in customer: forget their saved Market Chat. */
export async function clearChatHistory(): Promise<void> {
  const token = await getSessionToken();
  if (!token) return;
  await fetch(`${API_URL}/chat/history`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => {});
}

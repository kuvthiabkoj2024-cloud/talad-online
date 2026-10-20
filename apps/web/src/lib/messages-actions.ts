"use server";

import { API_URL } from "./api";
import type { ChatProductRef, ShopChatMessage, ShopThread } from "./messages";
import { getSessionToken } from "./session";

export type MessageError = "UNAUTHENTICATED" | "INVALID_IMAGE" | "FILE_TOO_LARGE" | "MESSAGE_TOO_LONG" | "EMPTY_MESSAGE" | "generic";

async function call<T>(method: string, path: string, body?: FormData): Promise<{ ok: true; data: T } | { ok: false; error: MessageError }> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const res = await fetch(`${API_URL}${path}`, { method, headers: { Authorization: `Bearer ${token}` }, body, cache: "no-store" });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    if (res.status === 401) return { ok: false, error: "UNAUTHENTICATED" };
    const code = json?.code as MessageError | undefined;
    return { ok: false, error: code && ["INVALID_IMAGE", "FILE_TOO_LARGE", "MESSAGE_TOO_LONG", "EMPTY_MESSAGE"].includes(code) ? code : "generic" };
  } catch {
    return { ok: false, error: "generic" };
  }
}

/** Messages newer than `after` (the chat screen polls this every few seconds). */
export async function fetchNewMessages(conversationId: string, after?: string) {
  return call<ShopThread>("GET", `/me/conversations/${conversationId}${after ? `?after=${after}` : ""}`);
}

/** Older messages, before `before` (scrolling up). */
export async function fetchOlderMessages(conversationId: string, before: string) {
  return call<ShopThread>("GET", `/me/conversations/${conversationId}?before=${before}`);
}

/** Send `text`, an optional `photo` and/or `productId`. */
export async function sendShopMessage(conversationId: string, form: FormData) {
  const body = new FormData();
  const text = String(form.get("text") ?? "").slice(0, 2000);
  if (text) body.set("text", text);
  const productId = form.get("productId");
  if (typeof productId === "string" && productId) body.set("productId", productId);
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) body.set("photo", photo, photo.name || "photo.jpg");
  return call<ShopChatMessage>("POST", `/me/conversations/${conversationId}/messages`, body);
}

export async function markConversationRead(conversationId: string) {
  await call<null>("POST", `/me/conversations/${conversationId}/read`);
}

/** The product the customer is asking about (must be from this chat's shop). */
export async function fetchConversationProduct(conversationId: string, productId: string) {
  return call<ChatProductRef>("GET", `/me/conversations/${conversationId}/products/${productId}`);
}

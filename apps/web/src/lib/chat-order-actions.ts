"use server";

import type { Locale } from "@talad/shared";
import { API_URL } from "./api";
import type { CartErrorCode } from "./cart";
import type { ChatOrderPatch, ChatOrderView } from "./chat-orders";
import { getSessionToken } from "./session";

export type ChatOrderError = CartErrorCode | "ORDER_CLOSED" | "PAYMENT_REQUIRED" | "ORDER_NOT_FOUND";
export type ChatOrderResult<T> = { ok: true; data: T } | { ok: false; error: ChatOrderError };

const KNOWN = new Set<string>([
  "OPTION_REQUIRED", "OUT_OF_STOCK", "PRODUCT_UNAVAILABLE", "CART_CHANGED", "PRICE_CHANGED", "ADDRESS_REQUIRED", "NOTHING_SELECTED",
  "SLIP_REQUIRED", "TRANSFER_UNAVAILABLE", "INVALID_IMAGE", "FILE_TOO_LARGE", "OWN_PRODUCT", "SHOP_BLOCKED", "DELIVERY_REQUIRED",
  "PAYMENT_METHOD_DISABLED", "COUPON_INVALID", "COUPON_NOT_STARTED", "COUPON_EXPIRED", "COUPON_USED_UP", "COUPON_ALREADY_USED", "COUPON_MIN_ORDER", "COUPON_OWN_SHOP",
  "ORDER_CLOSED", "PAYMENT_REQUIRED", "ORDER_NOT_FOUND", "SHOP_NOT_FOUND",
]);

async function call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<ChatOrderResult<T>> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && !(body instanceof FormData) && { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      cache: "no-store",
    });
    const json = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    if (res.status === 401) return { ok: false, error: "UNAUTHENTICATED" };
    if (res.status === 413) return { ok: false, error: "FILE_TOO_LARGE" };
    const code = json?.code as string | undefined;
    return { ok: false, error: (code && KNOWN.has(code) ? code : "generic") as ChatOrderError };
  } catch {
    return { ok: false, error: "generic" };
  }
}

const uuid = /^[0-9a-f-]{36}$/i;

export async function getChatOrder(id: string) {
  if (!uuid.test(id)) return { ok: false, error: "ORDER_NOT_FOUND" } as const;
  return call<ChatOrderView>("GET", `/me/chat-orders/${id}`);
}

export async function updateChatOrder(id: string, patch: ChatOrderPatch) {
  return call<ChatOrderView>("PATCH", `/me/chat-orders/${id}`, patch);
}

/** `slip` in the form data: the transfer slip photo. */
export async function uploadChatOrderSlip(id: string, form: FormData) {
  const slip = form.get("slip");
  if (!(slip instanceof File) || slip.size === 0) return { ok: false, error: "INVALID_IMAGE" } as const;
  const body = new FormData();
  body.set("file", slip);
  return call<ChatOrderView>("POST", `/me/chat-orders/${id}/slip`, body);
}

export async function placeChatOrder(id: string, expectedTotal: number) {
  return call<ChatOrderView & { placed: { orderNumber: string; shopOrders: string[] } }>("POST", `/me/chat-orders/${id}/place`, { expectedTotal });
}

export async function cancelChatOrder(id: string) {
  return call<null>("POST", `/me/chat-orders/${id}/cancel`);
}

/** "Buy" on a product in the shop's private chat: an order card in that chat. */
export async function startShopChatOrder(conversationId: string, item: { productId: string; variantId?: string | null; quantity?: number }) {
  return call<{ orderId: string }>("POST", `/me/conversations/${conversationId}/orders`, {
    items: [{ productId: item.productId, variantId: item.variantId ?? null, quantity: item.quantity ?? 1 }],
  });
}

/** "Buy now" in Market Chat: an order card in the customer's Market Chat. */
export async function startMarketChatOrder(item: { productId: string; variantId?: string | null; quantity?: number }, locale: Locale) {
  return call<{ id: string; role: "assistant"; text: string; lang: Locale; orderId: string }>("POST", "/chat/orders", {
    productId: item.productId,
    ...(item.variantId && { variantId: item.variantId }),
    quantity: item.quantity ?? 1,
    locale,
  });
}

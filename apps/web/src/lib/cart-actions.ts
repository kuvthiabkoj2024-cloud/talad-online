"use server";

import { MAX_PAYMENT_SLIPS, type CheckoutPaymentMethod } from "@talad/shared";
import { API_URL } from "./api";
import type { CartErrorCode, CartResult, CheckoutQuote, PlacedOrder } from "./cart";
import { getSessionToken } from "./session";

const KNOWN = new Set<CartErrorCode>([
  "OPTION_REQUIRED",
  "OUT_OF_STOCK",
  "PRODUCT_UNAVAILABLE",
  "CART_FULL",
  "CART_CHANGED",
  "PRICE_CHANGED",
  "ADDRESS_REQUIRED",
  "NOTHING_SELECTED",
  "NOT_PAYABLE",
  "SLIP_REQUIRED",
  "TRANSFER_UNAVAILABLE",
  "COD_UNAVAILABLE",
  "INVALID_IMAGE",
  "FILE_TOO_LARGE",
  "OWN_PRODUCT",
  "SHOP_BLOCKED",
  "DELIVERY_REQUIRED",
  "PAYMENT_METHOD_DISABLED",
  "COUPON_INVALID",
  "COUPON_NOT_STARTED",
  "COUPON_EXPIRED",
  "COUPON_USED_UP",
  "COUPON_ALREADY_USED",
  "COUPON_MIN_ORDER",
  "COUPON_OWN_SHOP",
]);

async function send<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<CartResult<{ data: T }>> {
  const token = await getSessionToken();
  if (!token) return { ok: false, error: "UNAUTHENTICATED" };
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined && !(body instanceof FormData) && { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    if (res.status === 401) return { ok: false, error: "UNAUTHENTICATED" };
    if (res.status === 413) return { ok: false, error: "FILE_TOO_LARGE" };
    const code = json?.code as CartErrorCode | undefined;
    return { ok: false, error: code && KNOWN.has(code) ? code : "generic" };
  } catch {
    return { ok: false, error: "generic" };
  }
}

type Count = { count: number };

export async function addToCart(input: {
  productId: string;
  variantId?: string | null;
  quantity: number;
}): Promise<CartResult<{ itemId: string; count: number }>> {
  const res = await send<{ itemId: string; count: number }>("POST", "/me/cart/items", {
    productId: input.productId,
    quantity: input.quantity,
    ...(input.variantId && { variantId: input.variantId }),
  });
  return res.ok ? { ok: true, ...res.data } : res;
}

export async function setCartQuantity(itemId: string, quantity: number): Promise<CartResult<Count>> {
  const res = await send<Count>("PATCH", `/me/cart/items/${itemId}`, { quantity });
  return res.ok ? { ok: true, ...res.data } : res;
}

/** What the customer picked at checkout; the API re-prices from it. */
export interface CheckoutSelection {
  itemIds: string[];
  deliveryProviderId?: string;
  couponCode?: string;
  addressId?: string;
  /** Shops whose own urgent delivery the customer chose. */
  urgentShopIds?: string[];
  /** Shops the customer will collect from in person. */
  pickupShopIds?: string[];
  /** Spend loyalty points (as many as the balance and total allow). */
  usePoints?: boolean;
}

/** Re-price the checkout after a quantity, courier, coupon or address change. */
export async function getCheckoutQuote(selection: CheckoutSelection): Promise<CartResult<{ quote: CheckoutQuote }>> {
  const res = await send<CheckoutQuote>("POST", "/me/checkout/quote", selection);
  return res.ok ? { ok: true, quote: res.data } : res;
}

export async function removeCartItem(itemId: string): Promise<CartResult<Count>> {
  const res = await send<Count>("DELETE", `/me/cart/items/${itemId}`);
  return res.ok ? { ok: true, ...res.data } : res;
}

export async function placeOrder(input: {
  itemIds: string[];
  addressId: string;
  deliveryProviderId?: string;
  couponCode?: string;
  urgentShopIds?: string[];
  pickupShopIds?: string[];
  usePoints?: boolean;
  paymentMethod: CheckoutPaymentMethod;
  expectedTotal: number;
  /** BANK_TRANSFER: 1–3 slip keys for the whole order (one transfer to Taladonline). */
  slipKeys?: string[];
  note?: string;
}): Promise<CartResult<{ order: PlacedOrder }>> {
  const res = await send<PlacedOrder>("POST", "/me/checkout", input);
  return res.ok ? { ok: true, order: res.data } : res;
}

/** "I received it": completes a delivered order now (interim — returns come later). */
export async function receiveOrder(shopOrderNumber: string): Promise<CartResult> {
  const res = await send("POST", `/me/orders/${encodeURIComponent(shopOrderNumber)}/receive`);
  return res.ok ? { ok: true } : res;
}

/** Cancels an unpaid transfer whose slips were rejected (every shop in that checkout). */
export async function cancelOrder(shopOrderNumber: string): Promise<CartResult> {
  const res = await send("POST", `/me/orders/${encodeURIComponent(shopOrderNumber)}/cancel`);
  return res.ok ? { ok: true } : res;
}

/** `slip` in the form data: the transfer slip image, uploaded before placing the order. */
export async function uploadCheckoutSlip(form: FormData): Promise<CartResult<{ slipKey: string }>> {
  const slip = form.get("slip");
  if (!(slip instanceof File) || slip.size === 0) return { ok: false, error: "INVALID_IMAGE" };
  const upload = new FormData();
  upload.set("file", slip);
  const res = await send<{ slipKey: string }>("POST", "/me/checkout/slips", upload);
  return res.ok ? { ok: true, slipKey: res.data.slipKey } : res;
}

/** `slips` in the form data: 1–3 new slips for an order still waiting for payment (e.g. after a rejection). */
export async function attachOrderSlips(orderNumber: string, form: FormData): Promise<CartResult> {
  const files = form.getAll("slips").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length || files.length > MAX_PAYMENT_SLIPS) return { ok: false, error: "INVALID_IMAGE" };
  const upload = new FormData();
  for (const f of files) upload.append("files", f);
  const res = await send("POST", `/me/orders/${encodeURIComponent(orderNumber)}/payment-slips`, upload);
  return res.ok ? { ok: true } : res;
}

"use server";

import type { CheckoutPaymentMethod } from "@talad/shared";
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
  "INVALID_IMAGE",
  "FILE_TOO_LARGE",
  "OWN_PRODUCT",
  "DELIVERY_REQUIRED",
  "COUPON_INVALID",
  "COUPON_EXPIRED",
  "COUPON_USED_UP",
  "COUPON_ALREADY_USED",
  "COUPON_MIN_ORDER",
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
  paymentMethod: CheckoutPaymentMethod;
  expectedTotal: number;
  /** { [shopId]: slipKey } for QR transfers. */
  slips?: Record<string, string>;
  note?: string;
}): Promise<CartResult<{ order: PlacedOrder }>> {
  const res = await send<PlacedOrder>("POST", "/me/checkout", input);
  return res.ok ? { ok: true, order: res.data } : res;
}

/** Development only: stands in for a payment gateway callback. */
export async function simulatePayment(shopOrderNumber: string): Promise<CartResult> {
  const res = await send("POST", `/me/checkout/simulate-payment/${encodeURIComponent(shopOrderNumber)}`);
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

/** Pay later / replace a slip on an order still awaiting payment. */
export async function attachOrderSlip(orderNumber: string, form: FormData): Promise<CartResult> {
  const slip = form.get("slip");
  if (!(slip instanceof File) || slip.size === 0) return { ok: false, error: "INVALID_IMAGE" };
  const upload = new FormData();
  upload.set("file", slip);
  const res = await send("POST", `/me/orders/${encodeURIComponent(orderNumber)}/payment-slip`, upload);
  return res.ok ? { ok: true } : res;
}

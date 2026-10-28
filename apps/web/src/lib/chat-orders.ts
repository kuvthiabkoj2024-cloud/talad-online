import type { CheckoutPaymentMethod } from "@talad/shared";
import type { DeliveryOption, TransferAccount } from "./cart";
import type { AddressItem } from "./profile";

/** Buy by chat: what both sides see on an order card in a chat (mirrors the API). */
export interface ChatOrderSummary {
  id: string;
  status: "DRAFT" | "PLACED" | "CANCELLED";
  orderNumber: string | null;
  createdBy: "CUSTOMER" | "SHOP" | "BOT" | "ASSISTANT";
  items: { name: string; variantLabel: string | null; quantity: number; imageUrl: string | null }[];
  total: number;
}

export interface ChatOrderItem {
  index: number;
  productId: string;
  productSlug: string;
  variantId: string | null;
  quantity: number;
  name: string;
  variantLabel: string | null;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  lineTotal: number;
  stock: number;
  available: boolean;
  /** The product has options (size, colour…) and none is chosen yet. */
  needsOption: boolean;
  variants: { id: string; attributes: Record<string, string>; stock: number }[];
  issue: "UNAVAILABLE" | "QUANTITY_EXCEEDS_STOCK" | "OWN_PRODUCT" | null;
}

export type ChatOrderMissing = "OPTION" | "ADDRESS" | "PAYMENT" | "SLIP" | "ISSUES";

/** The full card, for its customer only. */
export interface ChatOrderView {
  id: string;
  status: ChatOrderSummary["status"];
  orderNumber: string | null;
  createdBy: ChatOrderSummary["createdBy"];
  source: "SHOP_CHAT" | "MARKET_CHAT";
  shop: { id: string; slug: string; name: string; logoUrl: string | null };
  items: ChatOrderItem[];
  addresses: AddressItem[];
  addressId: string | null;
  delivery: { options: DeliveryOption[]; selectedId: string | null };
  paymentMethods: CheckoutPaymentMethod[];
  paymentMethod: CheckoutPaymentMethod | null;
  transfer: TransferAccount | null;
  slipAttached: boolean;
  coupon: { code: string; shopId: string | null; discount: number } | null;
  couponRemoved: boolean;
  subtotal: number;
  discountTotal: number;
  total: number;
  missing: ChatOrderMissing[];
  maxQuantity: number;
}

export interface ChatOrderPatch {
  items?: { productId: string; variantId: string | null; quantity: number }[];
  addressId?: string;
  deliveryProviderId?: string;
  paymentMethod?: CheckoutPaymentMethod;
  /** "" removes the coupon; null goes back to the shop's best one. */
  couponCode?: string | null;
}

import type { CheckoutPaymentMethod } from "@talad/shared";

/** Mirrors the API cart (services/api cart module). */
export interface CartItem {
  id: string;
  productId: string;
  productSlug: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  stock: number;
  available: boolean;
  /** The buyer owns this product's shop (can't buy from themselves). */
  ownShop: boolean;
  lineTotal: number;
}

export interface CartShop {
  shop: { id: string; slug: string; name: string };
  items: CartItem[];
  subtotal: number;
}

export interface CartView {
  shops: CartShop[];
  count: number;
}

/** Where a customer sends a manual transfer for one shop. */
export interface ShopTransferInfo {
  bankCode: string | null;
  accountName: string | null;
  accountNumber: string | null;
  hasQr: boolean;
}

/** A courier offered at checkout. Not priced: the customer pays the courier directly. */
export interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
}

export type CouponErrorCode =
  | "COUPON_INVALID"
  | "COUPON_NOT_STARTED"
  | "COUPON_EXPIRED"
  | "COUPON_USED_UP"
  | "COUPON_ALREADY_USED"
  | "COUPON_MIN_ORDER"
  | "COUPON_OWN_SHOP";

export interface CheckoutQuote {
  /** `cod`: the shop offers cash on delivery (each shop decides). */
  shops: (CartShop & {
    discount: number;
    total: number;
    transfer: ShopTransferInfo | null;
    cod: boolean;
    /** The shop's own urgent delivery to this address (null when it doesn't deliver there). */
    urgent: { fee: number; eta: string } | null;
    /** The customer chose it; its fee is `shippingFee` (in `total`). */
    urgentSelected: boolean;
    shippingFee: number;
  })[];
  subtotal: number;
  discountTotal: number;
  /** Urgent delivery fees (couriers are paid outside Taladonline). */
  shippingTotal: number;
  total: number;
  delivery: { options: DeliveryOption[]; selectedId: string | null };
  /** The applied coupon; `couponError` says why a requested code wasn't applied. */
  coupon: { code: string; shopId: string | null; discount: number } | null;
  couponError: CouponErrorCode | null;
  issues: { itemId: string; code: "UNAVAILABLE" | "QUANTITY_EXCEEDS_STOCK" | "OWN_PRODUCT" }[];
  /** QR transfer needs every shop in the order to accept transfers. */
  transferAvailable: boolean;
  /** Cash on delivery needs every shop in the order to offer it. */
  codAvailable: boolean;
  /** Methods the platform currently allows (admin settings). */
  paymentMethods: CheckoutPaymentMethod[];
}

export interface PlacedOrder {
  orderNumber: string;
  shopOrders: string[];
  total: number;
  paymentMethod: CheckoutPaymentMethod;
}

export type CartErrorCode =
  | "OPTION_REQUIRED"
  | "OUT_OF_STOCK"
  | "PRODUCT_UNAVAILABLE"
  | "CART_FULL"
  | "CART_CHANGED"
  | "PRICE_CHANGED"
  | "ADDRESS_REQUIRED"
  | "NOTHING_SELECTED"
  | "NOT_PAYABLE"
  | "SLIP_REQUIRED"
  | "TRANSFER_UNAVAILABLE"
  | "COD_UNAVAILABLE"
  | "INVALID_IMAGE"
  | "FILE_TOO_LARGE"
  | "OWN_PRODUCT"
  | "SHOP_BLOCKED"
  | "DELIVERY_REQUIRED"
  | "PAYMENT_METHOD_DISABLED"
  | CouponErrorCode
  | "UNAUTHENTICATED"
  | "generic";

export type CartResult<T = object> = ({ ok: true } & T) | { ok: false; error: CartErrorCode };

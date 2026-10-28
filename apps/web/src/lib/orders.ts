import type { OrderStatus, OrderTab, PaymentMethod } from "@talad/shared";
import type { TransferAccount } from "./cart";

/** Mirrors the customer orders API (services/api orders module). */
export interface OrderLine {
  productSlug: string;
  name: string;
  variant: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
}

export interface OrderSummary {
  number: string;
  status: OrderStatus;
  /** Transfer slips sent, waiting for Taladonline's check. */
  awaitingConfirmation: boolean;
  /** Where the transfer stands while the order waits for payment. */
  paymentCheck: PaymentCheck;
  /** Unpaid and not waiting for a check (slips rejected, or none sent): the customer may cancel. */
  cancellable?: boolean;
  createdAt: string;
  total: number;
  itemCount: number;
  shop: { slug: string; name: string };
  items: OrderLine[];
}

export interface OrderList {
  counts: Record<OrderTab | "all", number>;
  orders: OrderSummary[];
  page: number;
  pageSize: number;
  /** Orders in the current tab. */
  total: number;
  totalPages: number;
}

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "EXPIRED";

/** Taladonline's check of the transfer: being checked, rejected (send new slips) or approved. */
export type PaymentCheck = "reviewing" | "rejected" | "approved" | null;

export interface PaymentSlip {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectReason: string | null;
  createdAt: string;
}

export interface ShippingAddress {
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  village?: string;
  line: string;
}

export interface OrderDetail extends Omit<OrderSummary, "shop"> {
  orderNumber: string;
  updatedAt: string;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  currency: string;
  trackingNumber: string | null;
  /** The shop photographed the courier's bill when shipping. */
  hasShippingBill?: boolean;
  /** Urgent delivery by the shop itself (its fee is `shippingFee`). */
  urgentDelivery?: boolean;
  /** Collected at the shop: where to go. */
  pickup?: { address: string | null; phone: string; latitude: number | null; longitude: number | null } | null;
  deliveryProvider: string | null;
  paymentDueAt: string | null;
  autoConfirmAt: string | null;
  cancelReason: string | null;
  shippingAddress: ShippingAddress;
  shop: { slug: string; name: string; logoUrl: string | null };
  payment: {
    method: PaymentMethod;
    status: PaymentStatus;
    amount: number;
    paidAt: string | null;
    /** A paid order that was cancelled: when Taladonline sent the money back. */
    refundedAt: string | null;
  } | null;
  /** Taladonline's account to transfer to (while the order waits for payment). */
  transfer: TransferAccount | null;
  /** One transfer pays the whole checkout (all its shops). */
  orderTotal: number;
  /** Slips sent for the checkout, newest first. */
  slips: PaymentSlip[];
  /** Loyalty points for confirming receipt (none if it completes on its own). */
  pointsOnReceive: number;
  /** Points spent on this order (their value is in `discountTotal`). */
  pointsUsed: number;
  note: string | null;
  history: { status: OrderStatus; note: string | null; at: string }[];
}

/** Badge colours per status: amber = action needed, blue = in progress, green = done, grey/red = closed. */
export const STATUS_TONE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  CONFIRMED: "bg-sky-50 text-sky-700 ring-sky-200",
  PACKED: "bg-sky-50 text-sky-700 ring-sky-200",
  SHIPPED: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  DELIVERED: "bg-primary-soft text-primary ring-primary/25",
  COMPLETED: "bg-primary-soft text-primary ring-primary/25",
  CANCELLED: "bg-muted text-muted-foreground ring-border",
  RETURN_REQUESTED: "bg-orange-50 text-orange-700 ring-orange-200",
};

const DATE_LOCALES = { lo: "lo-LA", en: "en-GB" } as const;

export function formatDate(iso: string, locale: keyof typeof DATE_LOCALES, withTime = false): string {
  return new Intl.DateTimeFormat(DATE_LOCALES[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime && { hour: "2-digit", minute: "2-digit" }),
  }).format(new Date(iso));
}

/** Mirrors `PointsView` (GET /me/points). */
export interface PointsView {
  balance: number;
  pointValue: number;
  worth: number;
  earnPer: number;
  expiryDays: number | null;
  items: { id: string; type: "EARN" | "REDEEM" | "EXPIRE" | "ADJUST"; points: number; note: string | null; orderNumber: string | null; expiresAt: string | null; createdAt: string }[];
  nextCursor: string | null;
}

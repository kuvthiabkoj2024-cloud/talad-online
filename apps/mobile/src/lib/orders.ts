import type { DepositStatus, GuaranteeUnit, OrderStatus, PaymentMethod } from '@talad/shared';

import { filePart, postForm, type LocalFile } from './api';

/** Mirrors the customer order API (GET /me/orders/:number), as the website's `OrderDetail`. */
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED';
/** MC Mart's check of a transfer: being checked, rejected (send new slips) or approved. */
export type PaymentCheck = 'reviewing' | 'rejected' | 'approved' | null;

export interface TransferAccount {
  bankCode: string | null;
  accountName: string | null;
  accountNumber: string | null;
  hasQr: boolean;
}

export interface PaymentSlip {
  id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectReason: string | null;
  createdAt: string;
}

export interface OrderLine {
  productSlug: string;
  name: string;
  variant: string | null;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
  guarantee?: { duration: number; unit: GuaranteeUnit; terms: string | null } | null;
}

export interface OrderDetail {
  number: string;
  status: OrderStatus;
  awaitingConfirmation: boolean;
  paymentCheck: PaymentCheck;
  cancellable?: boolean;
  createdAt: string;
  total: number;
  itemCount: number;
  items: OrderLine[];
  returnable: boolean;
  returnDeadline: string | null;
  returnRequest: { raisedBy: string; reason: string; details: string | null; status: string; resolution: string | null; files: number; createdAt: string } | null;
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  trackingNumber: string | null;
  hasShippingBill?: boolean;
  billIssueAt?: string | null;
  billReportable?: boolean;
  urgentDelivery?: boolean;
  pickup?: { address: string | null; phone: string; latitude: number | null; longitude: number | null } | null;
  deliveryProvider: string | null;
  paymentDueAt: string | null;
  autoConfirmAt: string | null;
  cancelReason: string | null;
  shippingAddress: { recipientName: string; phone: string; province: string; district: string; village?: string; line: string };
  shop: { slug: string; name: string; logoUrl: string | null };
  payment: { method: PaymentMethod; status: PaymentStatus; amount: number; paidAt: string | null; refundedAt: string | null; hasRefundSlip?: boolean } | null;
  transfer: TransferAccount | null;
  orderTotal: number;
  slips: PaymentSlip[];
  pointsOnReceive: number;
  pointsEarned: number;
  completedAt: string | null;
  deposit: {
    amount: number;
    status: DepositStatus;
    rejectReason: string | null;
    dueAt: string | null;
    shopId: string;
    account: TransferAccount | null;
  } | null;
  collectOnDelivery: number;
  noPoints: boolean;
  pointsUsed: number;
  note: string | null;
  history: { status: OrderStatus; note: string | null; at: string }[];
}

export const orderKey = (number: string) => ['me', 'order', number] as const;
export const orderPath = (number: string) => `/me/orders/${encodeURIComponent(number)}`;

export type { LocalFile };

/** Sends several files under one form field (payment slips: `files`), with the sign-in token. */
export async function postFiles<T>(path: string, field: string, files: LocalFile[]): Promise<T> {
  const form = new FormData();
  for (const [i, f] of files.entries()) form.append(field, await filePart(f, `photo-${i + 1}.jpg`));
  return postForm<T>(path, form);
}

/** Mirrors `TrackedOrder` (POST /orders/track): where an order is, without anything private. */
export interface TrackedOrder {
  number: string;
  status: OrderStatus;
  createdAt: string;
  shop: { slug: string; name: string; logoUrl: string | null };
  items: { name: string; variant: string | null; quantity: number; imageUrl: string | null }[];
  itemCount: number;
  destination: { province: string; district: string } | null;
  pickup: boolean;
  urgentDelivery: boolean;
  deliveryProvider: string | null;
  trackingNumber: string | null;
  autoConfirmAt: string | null;
  history: { status: OrderStatus; at: string }[];
}

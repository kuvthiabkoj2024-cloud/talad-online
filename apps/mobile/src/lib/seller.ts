import type { DepositStatus, GuaranteeUnit, OrderStatus, PaymentMethod, ShopOrderAction, ShopOrderTab, ShopStatus } from '@talad/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api } from './api';

/**
 * The seller side of the app: the same `me/shop/*` API as the Seller Center (apps/shop), with the
 * same sign-in (a shop belongs to a customer account). Types mirror apps/shop/src/lib/types.ts.
 */

export interface MyShop {
  id: string;
  slug: string;
  name: string;
  status: ShopStatus;
  rejectionReason: string | null;
  logoUrl: string | null;
  phone: string;
  followerCount: number;
}

export interface ShopSummary {
  orders: { toPay: number; toShip: number; shipping: number; cancelled: number; returns: number; completed: number };
  products: { published: number; pending: number; draft: number; rejected: number; lowStock: number };
  activeCoupons: number;
  setup: { pickupAddress: boolean; payment: boolean; logo: boolean };
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED' | 'EXPIRED';

export interface ShopOrderLine {
  name: string;
  sku: string;
  variant: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
  productSlug: string;
  guarantee: { duration: number; unit: GuaranteeUnit } | null;
}

export interface ShopOrderSummary {
  number: string;
  status: OrderStatus;
  createdAt: string;
  total: number;
  itemCount: number;
  items: ShopOrderLine[];
  customer: { name: string };
  payment: { method: PaymentMethod; status: PaymentStatus; hasSlip: boolean } | null;
  awaitingConfirmation: boolean;
  paymentDueAt: string | null;
  urgent: boolean;
  pickup: boolean;
  deliveryProvider: { id: string; name: string } | null;
  billError: boolean;
  depositStatus: DepositStatus | null;
}

export interface ShopOrderList {
  items: ShopOrderSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  counts: Record<ShopOrderTab | 'all', number>;
}

export interface ShippingAddress {
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  village: string;
  line: string;
}

export interface ShopOrderDetail extends Omit<ShopOrderSummary, 'customer' | 'payment'> {
  subtotal: number;
  discountTotal: number;
  shippingFee: number;
  platformDiscount: number;
  commissionAmount: number;
  note: string | null;
  customer: { id: string; name: string; phone: string | null };
  shippingAddress: ShippingAddress | null;
  trackingNumber: string | null;
  hasShippingBill: boolean;
  billIssueAt: string | null;
  billReplaceable: boolean;
  urgentDelivery: boolean;
  autoConfirmAt: string | null;
  cancelReason: string | null;
  payment: { method: PaymentMethod; status: PaymentStatus; hasSlip: boolean; amount: number; paidAt: string | null; slipUploadedAt: string | null } | null;
  history: { status: OrderStatus; note: string | null; actor: 'SHOP' | 'CUSTOMER' | 'ADMIN' | null; at: string }[];
  dispute: { status: string; reason: string; createdAt: string } | null;
  returnable: boolean;
  deposit: { amount: number; status: DepositStatus; rejectReason: string | null; dueAt: string | null } | null;
  collectOnDelivery: number;
  actions: ShopOrderAction[];
}

export interface DeliveryProvider {
  id: string;
  name: string;
  mode: string;
}

export const sellerKeys = {
  shop: ['seller', 'shop'] as const,
  summary: ['seller', 'summary'] as const,
  badges: ['seller', 'badges'] as const,
  unread: ['seller', 'unread'] as const,
  orders: ['seller', 'orders'] as const,
  order: (number: string) => ['seller', 'order', number] as const,
  providers: ['seller', 'providers'] as const,
};

export const useMyShop = (enabled = true) => useQuery({ queryKey: sellerKeys.shop, queryFn: () => api<MyShop>('/me/shop'), enabled });
export const useShopSummary = () => useQuery({ queryKey: sellerKeys.summary, queryFn: () => api<ShopSummary>('/me/shop/summary') });
/** "New" counts on the Orders and Videos tiles. */
export const useShopBadges = () =>
  useQuery({ queryKey: sellerKeys.badges, queryFn: () => api<{ orders: number; videos: number }>('/me/shop/notifications/badges') });
export const useShopUnread = () =>
  useQuery({ queryKey: sellerKeys.unread, queryFn: () => api<{ count: number }>('/me/shop/conversations/unread-count').then((r) => r.count) });
export const useDeliveryProviders = () =>
  useQuery({ queryKey: sellerKeys.providers, queryFn: () => api<DeliveryProvider[]>('/me/shop/orders/delivery-providers'), staleTime: 5 * 60_000 });

/** Opening a section clears its "new" badge, as in the Seller Center. */
export function useClearBadge(section: 'orders' | 'videos') {
  const queryClient = useQueryClient();
  const { data } = useShopBadges();
  const pending = (data?.[section] ?? 0) > 0;
  useEffect(() => {
    if (!pending) return;
    void api(`/me/shop/notifications/read-section/${section}`, { method: 'POST' }).then(() => queryClient.invalidateQueries({ queryKey: sellerKeys.badges }));
  }, [pending, section, queryClient]);
}

/** After an order changes: its list, the home counts and badges. */
export function refreshOrders(queryClient: ReturnType<typeof useQueryClient>, saved?: ShopOrderDetail) {
  if (saved) queryClient.setQueryData(sellerKeys.order(saved.number), saved);
  void queryClient.invalidateQueries({ queryKey: sellerKeys.orders });
  void queryClient.invalidateQueries({ queryKey: sellerKeys.summary });
}

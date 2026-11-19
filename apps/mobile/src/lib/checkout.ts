import type { CheckoutPaymentMethod } from '@talad/shared';

import type { CartItem } from './api';
import type { TransferAccount } from './orders';

/** A courier offered at checkout. Not priced: the customer pays the courier directly. */
export interface DeliveryOption {
  id: string;
  code: string;
  name: string;
  logoUrl: string | null;
}

/** Mirrors the website's `CheckoutQuote` (POST /me/checkout/quote). */
export interface CheckoutQuote {
  shops: {
    shop: { id: string; slug: string; name: string };
    items: CartItem[];
    subtotal: number;
    discount: number;
    total: number;
    cod: boolean;
    /** The shop's own urgent delivery to this address (null when it doesn't deliver there). */
    urgent: { fee: number; free: boolean; distanceKm: number | null; eta: string } | null;
    urgentSelected: boolean;
    /** The shop delivers free within this many km, but the address isn't pinned to check. */
    pinForFreeKm: number | null;
    pickup: { address: string | null; latitude: number | null; longitude: number | null } | null;
    pickupSelected: boolean;
    shippingFee: number;
    /** Paid to this shop before ordering if the customer chooses COD, out of `total`. */
    deposit: number;
    depositAccount: TransferAccount | null;
    points: number;
    pointsDiscount: number;
  }[];
  points: { balance: number; value: number; usable: number; used: number; discount: number };
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  delivery: { options: DeliveryOption[]; selectedId: string | null; needed: boolean; noCommonCourier: boolean };
  coupon: { code: string; shopId: string | null; discount: number } | null;
  couponError: string | null;
  issues: { itemId: string; code: 'UNAVAILABLE' | 'QUANTITY_EXCEEDS_STOCK' | 'OWN_PRODUCT' }[];
  transfer: TransferAccount | null;
  transferAvailable: boolean;
  codAvailable: boolean;
  paymentMethods: CheckoutPaymentMethod[];
}

export interface PlacedOrder {
  orderNumber: string;
  shopOrders: string[];
  total: number;
  paymentMethod: CheckoutPaymentMethod;
}

/** What the customer picked; sent with every quote and with the order. */
export interface CheckoutSelection {
  itemIds: string[];
  deliveryProviderId?: string;
  couponCode?: string;
  addressId?: string;
  urgentShopIds?: string[];
  pickupShopIds?: string[];
  usePoints?: boolean;
}

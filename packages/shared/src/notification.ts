import type { Locale } from './locale.js';

/** What a customer notification is about (scope §4.7). Stored as `Notification.type`. */
export const NOTIFICATION_TYPES = ['ORDER', 'PROMOTION', 'PRICE_DROP', 'SYSTEM'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** What a Seller Center notification is about. */
export const SHOP_NOTIFICATION_TYPES = ['ORDER', 'ACTIVITY', 'SHOP_STATUS', 'SYSTEM'] as const;
export type ShopNotificationType = (typeof SHOP_NOTIFICATION_TYPES)[number];

/** What an admin notification is about. */
/**
 * `PAYMENT`: transfer slips to check; `REFUND`: a paid order was cancelled, refund the customer;
 * `COMMISSION`: a shop asks for its own commission on a product.
 */
export const ADMIN_NOTIFICATION_TYPES = ['SHOP_APPLICATION', 'PAYMENT', 'REFUND', 'COMMISSION', 'SYSTEM'] as const;
export type AdminNotificationType = (typeof ADMIN_NOTIFICATION_TYPES)[number];

/**
 * A live event pushed to a signed-in app (the API's `me/events`, `me/shop/events` and
 * `admin/events` streams). `notification` is also saved in that app's notification list.
 */
export type RealtimeEvent =
  | {
      kind: 'notification';
      id: string;
      type: string;
      title: string;
      body: string;
      /** Texts per language; `title` / `body` are the English fallback. */
      i18n?: Partial<Record<Locale, { title: string; body: string }>>;
      /** Where it leads, in that app (e.g. `/orders/TL…` in the Seller Center). */
      link?: string;
    }
  /** A chat message arrived: the chat refreshes, and a toast shows when it isn't open. */
  | { kind: 'message'; conversationId: string; from: string; preview: string }
  /** The shop's status changed (approved, rejected…): the Seller Center reloads it. */
  | { kind: 'shop.status'; status: string };

/** Notification page tabs and the types each one shows. */
export const NOTIFICATION_TABS = {
  orders: ['ORDER'],
  promotions: ['PROMOTION', 'PRICE_DROP'],
  updates: ['SYSTEM'],
} as const satisfies Record<string, readonly NotificationType[]>;
export type NotificationTab = keyof typeof NOTIFICATION_TABS;

export function isNotificationTab(value: unknown): value is NotificationTab {
  return typeof value === 'string' && Object.hasOwn(NOTIFICATION_TABS, value);
}

/** `Notification.data`: everything optional, so older rows keep rendering. */
export interface NotificationData {
  /** Where tapping it goes: a storefront path without the locale, e.g. `/account/orders/TL-1001`. */
  link?: string;
  /** Product or banner thumbnail (URL or storage key); a type icon is shown otherwise. */
  imageUrl?: string;
  /** Text per language; `title` / `body` are the fallback. */
  i18n?: Partial<Record<Locale, { title: string; body: string }>>;
}

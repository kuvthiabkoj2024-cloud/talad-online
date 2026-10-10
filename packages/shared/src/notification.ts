import type { Locale } from './locale.js';

/** What a customer notification is about (scope §4.7). Stored as `Notification.type`. */
export const NOTIFICATION_TYPES = ['ORDER', 'PROMOTION', 'PRICE_DROP', 'SYSTEM'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

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

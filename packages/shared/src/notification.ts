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
 * `COMMISSION`: a shop asks for its own commission on a product; `RETURN`: a return to decide.
 */
export const ADMIN_NOTIFICATION_TYPES = ['SHOP_APPLICATION', 'PAYMENT', 'REFUND', 'COMMISSION', 'RETURN', 'SYSTEM'] as const;
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

/**
 * A customer notification that is really seller news (a payout, a product decision…) links into
 * the Seller Center: `seller:/finance`. The storefront and its push notifications open that
 * path on the Seller Center's own site.
 */
export const SELLER_LINK_PREFIX = 'seller:';

export function sellerLink(path: string): string {
  return `${SELLER_LINK_PREFIX}${path}`;
}

/** The Seller Center path of a `seller:` link, or null for a storefront path. */
export function sellerPath(link: string): string | null {
  if (!link.startsWith(SELLER_LINK_PREFIX)) return null;
  const path = link.slice(SELLER_LINK_PREFIX.length);
  return path.startsWith('/') && !path.startsWith('//') ? path : null;
}

/** `Notification.data`: everything optional, so older rows keep rendering. */
export interface NotificationData {
  /**
   * Where tapping it goes, in the recipient's app: a storefront path without the locale
   * (`/account/orders/TL-1001`) or a `seller:` link for customers; a Seller Center or admin path otherwise.
   */
  link?: string;
  /** Product or banner thumbnail (URL or storage key); a type icon is shown otherwise. */
  imageUrl?: string;
  /** Text per language; `title` / `body` are the fallback. */
  i18n?: Partial<Record<Locale, { title: string; body: string }>>;
  /**
   * Who it's from, for its picture: a shop (its logo) or a customer (their photo). Without it,
   * an order notification shows the other side of the order; anything else is from MC Mart.
   */
  actor?: { type: 'shop' | 'customer'; id: string };
  /** Sent by an admin broadcast (shown as from MC Mart). */
  broadcastId?: string;
}

/** Who a listed notification is from (resolved by the API), shown as its picture. */
export type NotificationFrom =
  | { kind: 'mcmart' }
  | { kind: 'shop'; id: string; name: string; imageUrl: string | null }
  | { kind: 'customer'; id: string; name: string; avatarUrl: string | null; avatarVersion: string | null };

// ─── Admin broadcasts (in-app / push / SMS, now, later or repeating) ─────────

/** Everyone, or one person: all customers, all sellers (approved shops), one customer, one shop. */
export const BROADCAST_AUDIENCES = ['customers', 'sellers', 'customer', 'shop'] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];
/** In-app inbox, push (phones and the website/PWA) and SMS (one person only: it costs money). */
export const BROADCAST_CHANNELS = ['IN_APP', 'PUSH', 'SMS'] as const;
export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number];
export const BROADCAST_TYPES = ['PROMOTION', 'SYSTEM'] as const;
export type BroadcastType = (typeof BROADCAST_TYPES)[number];
/** Once (now or at a time), every day, or on chosen weekdays, at the same time of day. */
export const BROADCAST_REPEATS = ['ONCE', 'DAILY', 'WEEKLY'] as const;
export type BroadcastRepeat = (typeof BROADCAST_REPEATS)[number];
export const BROADCAST_STATUSES = ['ACTIVE', 'PAUSED', 'DONE'] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

/** Laos is UTC+7 all year (no daylight saving): schedules are set in Vientiane time. */
export const VIENTIANE_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When a broadcast sends next, strictly after `after`. `startAt` is the first send (date and
 * time); repeats go out at the same Vientiane time of day: every day (DAILY) or on `weekdays`
 * (WEEKLY, 0 = Sunday … 6 = Saturday, in Vientiane), never after `endAt`. A ONCE broadcast only
 * has `startAt`. Null = no more sends.
 */
export function nextBroadcastRun(
  schedule: { repeat: BroadcastRepeat; startAt: Date; endAt?: Date | null; weekdays?: readonly number[] },
  after: Date,
): Date | null {
  const { repeat, startAt, endAt, weekdays = [] } = schedule;
  if (repeat === 'ONCE') return startAt.getTime() > after.getTime() ? startAt : null;
  // Work on Vientiane "wall clock" time: shifted by +7 h, then read with UTC getters.
  const local = (d: Date) => new Date(d.getTime() + VIENTIANE_OFFSET_MS);
  const start = local(startAt);
  const timeOfDay = start.getTime() - Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const from = local(new Date(Math.max(after.getTime(), startAt.getTime() - 1)));
  let day = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  // At most a week ahead finds any weekday; one more day covers "today's time already passed".
  for (let i = 0; i < 9; i++, day += DAY_MS) {
    const at = new Date(day + timeOfDay - VIENTIANE_OFFSET_MS);
    if (at.getTime() <= after.getTime() || at.getTime() < startAt.getTime()) continue;
    if (endAt && at.getTime() > endAt.getTime()) return null;
    if (repeat === 'WEEKLY' && !weekdays.includes(new Date(day).getUTCDay())) continue;
    return at;
  }
  return null;
}

/** A broadcast's text in both languages. */
export type BroadcastContent = Record<'lo' | 'en', { title: string; body: string }>;

/**
 * Personal bits an admin can put in a broadcast's title and message: `{name}` (the recipient),
 * `{phone}` (their number) and `{shop}` (the shop's name, for shops and customers who own one).
 */
export const BROADCAST_VARIABLES = ['name', 'phone', 'shop'] as const;
export type BroadcastVariable = (typeof BROADCAST_VARIABLES)[number];
const VARIABLE = /\{(name|phone|shop)\}/g;

/** True when the text has any `{name}`, `{phone}` or `{shop}` (each recipient then gets their own). */
export const hasBroadcastVariables = (text: string): boolean => new RegExp(VARIABLE.source).test(text);

/** The text for one recipient: variables filled in (missing ones left out), stray double spaces tidied. */
export function fillBroadcastText(text: string, values: Partial<Record<BroadcastVariable, string | null>>): string {
  return text
    .replace(VARIABLE, (_, key: BroadcastVariable) => values[key] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?])/g, '$1')
    .trim();
}

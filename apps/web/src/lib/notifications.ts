import { sellerPath, type Locale, type NotificationData, type NotificationTab } from "@talad/shared";
import { SELLER_CENTER_URL } from "./customer";

/** Mirrors `CustomerNotification` from services/api notifications. */
export interface CustomerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: NotificationData;
  readAt: string | null;
  createdAt: string;
}

/** Mirrors `NotificationList` from services/api notifications. */
export interface NotificationList {
  items: CustomerNotification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unread: Record<NotificationTab | "all", number>;
}

/** Title and body in the viewer's language, falling back to the stored text. */
export function notificationText(n: CustomerNotification, locale: Locale): { title: string; body: string } {
  return n.data.i18n?.[locale] ?? { title: n.title, body: n.body };
}

/** Storefront URL a notification opens, or null. Only same-site paths are followed. */
export function notificationHref(n: CustomerNotification, locale: Locale): string | null {
  return linkHref(n.data.link, locale);
}

/**
 * A notification link as a URL: storefront paths get the language; `seller:` links (seller news
 * for a shop owner) open in the Seller Center. Anything else is ignored.
 */
export function linkHref(link: string | undefined, locale: Locale): string | null {
  if (!link) return null;
  const seller = sellerPath(link);
  if (seller) return `${SELLER_CENTER_URL.replace(/\/$/, "")}${seller}`;
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  return link === "/" ? `/${locale}` : `/${locale}${link}`;
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { NOTIFICATION_TABS, type AdminNotificationType, type NotificationData, type NotificationTab, type ShopNotificationType } from '@talad/shared';
import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
import { RealtimeService, type Audience } from '../realtime/realtime.service.js';
import type { ListNotificationsQuery } from './list-notifications.query.js';
import { orderMessage } from './order-messages.js';

export interface CustomerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  data: NotificationData;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationList {
  items: CustomerNotification[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Unread count per tab, plus `all`, for the tab badges. */
  unread: Record<NotificationTab | 'all', number>;
}

const TABS = Object.keys(NOTIFICATION_TABS) as NotificationTab[];

/** Who a notification is for: a customer account, a shop (Seller Center) or one admin. */
export type Recipient = { customerId: string } | { shopId: string } | { adminId: string };

type Text = { lo: { title: string; body: string }; en: { title: string; body: string } };
/** Notifications are written in the caller's transaction and announced live once it commits. */
type Db = Pick<Prisma.TransactionClient, 'notification' | '$executeRaw'>;

const audienceOf = (to: Recipient): Audience =>
  'customerId' in to ? `customer:${to.customerId}` : 'shopId' in to ? `shop:${to.shopId}` : `admin:${to.adminId}`;

/** A Seller Center or admin notification list (no tabs). */
export interface InboxPage {
  items: CustomerNotification[];
  unread: number;
  nextCursor: string | null;
}

function inTab(customerId: string, tab?: NotificationTab): Prisma.NotificationWhereInput {
  return { customerId, ...(tab && { type: { in: [...NOTIFICATION_TABS[tab]] } }) };
}

/**
 * In-app notifications (§4.7) for customers, shops (Seller Center) and admins. Each one is
 * saved and pushed live to that recipient's open apps (RealtimeService).
 */
export const SHOP_BADGE_SECTIONS = ['orders', 'videos'] as const;
export type ShopBadgeSection = (typeof SHOP_BADGE_SECTIONS)[number];

/** Which shop notifications belong to a Seller Center section. */
const SECTION_WHERE: Record<ShopBadgeSection, Prisma.NotificationWhereInput> = {
  orders: { type: 'ORDER' },
  videos: { type: 'ACTIVITY', data: { path: ['link'], equals: '/videos' } },
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Saves a bilingual notification for `to` and announces it live (after the transaction commits). */
  private async create(db: Db, to: Recipient, type: string, text: Text, extra: Omit<NotificationData, 'i18n'> = {}): Promise<void> {
    const data: NotificationData = { ...extra, i18n: text };
    const row = await db.notification.create({
      data: { ...to, type, title: text.en.title, body: text.en.body, data: data as object },
      select: { id: true },
    });
    await this.realtime.emit(db, audienceOf(to), {
      kind: 'notification',
      id: row.id,
      type,
      title: text.en.title,
      body: text.en.body,
      i18n: text,
      ...(extra.link && { link: extra.link }),
    });
  }

  /** A Seller Center notification: new orders, activity on the shop's videos, its approval… */
  async toShop(db: Db, shopId: string, type: ShopNotificationType, text: Text, extra: Omit<NotificationData, 'i18n'> = {}): Promise<void> {
    await this.create(db, { shopId }, type, text, extra);
  }

  /** The same notification for every active admin (e.g. a new shop to review). */
  async toAdmins(db: Db, type: AdminNotificationType, text: Text, extra: Omit<NotificationData, 'i18n'> = {}): Promise<void> {
    const admins = await this.prisma.adminUser.findMany({ where: { isActive: true }, select: { id: true } });
    for (const a of admins) await this.create(db, { adminId: a.id }, type, text, extra);
  }

  /** Newest first, 20 at a time (`cursor` = the last id seen), with the unread count. */
  async inbox(to: { shopId: string } | { adminId: string }, cursor?: string): Promise<InboxPage> {
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: to,
        orderBy: { id: 'desc' },
        take: 21,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
        select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where: { ...to, readAt: null } }),
    ]);
    const items = rows.slice(0, 20).map((r) => {
      const data = (r.data ?? {}) as NotificationData;
      return { ...r, data: { ...data, imageUrl: data.imageUrl && this.media.publicUrl(data.imageUrl) } };
    });
    return { items, unread, nextCursor: rows.length > 20 ? items[items.length - 1].id : null };
  }

  async inboxUnread(to: { shopId: string } | { adminId: string }): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { ...to, readAt: null } }) };
  }

  /**
   * "New" badges on Seller Center tiles: unread order notifications (new orders, slips) and
   * unread video activity (likes, comments). Visiting the section clears them.
   */
  async shopBadges(shopId: string): Promise<Record<ShopBadgeSection, number>> {
    const [orders, videos] = await Promise.all(SHOP_BADGE_SECTIONS.map((s) => this.prisma.notification.count({ where: { shopId, readAt: null, ...SECTION_WHERE[s] } })));
    return { orders, videos };
  }

  async shopSectionRead(shopId: string, section: ShopBadgeSection): Promise<void> {
    await this.prisma.notification.updateMany({ where: { shopId, readAt: null, ...SECTION_WHERE[section] }, data: { readAt: new Date() } });
  }

  /** One notification (or all, without `id`) read in a Seller Center / admin inbox. */
  async inboxRead(to: { shopId: string } | { adminId: string }, id?: string): Promise<void> {
    await this.prisma.notification.updateMany({ where: { ...to, ...(id && { id }), readAt: null }, data: { readAt: new Date() } });
  }

  async list(customerId: string, query: ListNotificationsQuery): Promise<NotificationList> {
    const where = inTab(customerId, query.tab);
    const [rows, total, unreadByType] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: { id: true, type: true, title: true, body: true, data: true, readAt: true, createdAt: true },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.groupBy({
        by: ['type'],
        where: { customerId, readAt: null },
        _count: { _all: true },
      }),
    ]);

    const unreadOf = (types: readonly string[]) =>
      unreadByType.filter((g) => types.includes(g.type)).reduce((sum, g) => sum + g._count._all, 0);
    const unread = {
      all: unreadByType.reduce((sum, g) => sum + g._count._all, 0),
      ...Object.fromEntries(TABS.map((t) => [t, unreadOf(NOTIFICATION_TABS[t])])),
    } as NotificationList['unread'];

    return {
      items: rows.map((r) => {
        const data = (r.data ?? {}) as NotificationData;
        return { ...r, data: { ...data, imageUrl: data.imageUrl && this.media.publicUrl(data.imageUrl) } };
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      unread,
    };
  }

  async unreadCount(customerId: string): Promise<{ count: number }> {
    return { count: await this.prisma.notification.count({ where: { customerId, readAt: null } }) };
  }

  async markRead(customerId: string, id: string): Promise<void> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, customerId },
      data: { readAt: new Date() },
    });
    if (count === 0) throw new NotFoundException('Notification not found');
  }

  /** A bilingual notification to one account (shop owners get seller news here too). */
  async send(
    db: Db,
    customerId: string,
    type: 'ORDER' | 'PROMOTION' | 'PRICE_DROP' | 'SYSTEM',
    text: Text,
    extra: Omit<NotificationData, 'i18n'> = {},
  ): Promise<void> {
    await this.create(db, { customerId }, type, text, extra);
  }

  /** Tells a customer their order moved to `status` (shop actions and deadline sweeps). */
  async notifyOrder(
    db: Db,
    order: { customerId: string; number: string; shopName: string; imageKey?: string | null },
    status: OrderStatus,
    reason?: string | null,
  ): Promise<void> {
    const text = orderMessage(status, order.number, order.shopName, reason);
    await this.create(db, { customerId: order.customerId }, 'ORDER', text, {
      link: `/account/orders/${order.number}`,
      ...(order.imageKey && { imageUrl: order.imageKey }),
    });
  }

  async markAllRead(customerId: string, tab?: NotificationTab): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { ...inTab(customerId, tab), readAt: null },
      data: { readAt: new Date() },
    });
  }
}

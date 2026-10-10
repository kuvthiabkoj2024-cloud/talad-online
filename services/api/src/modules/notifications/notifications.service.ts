import { Injectable, NotFoundException } from '@nestjs/common';
import { NOTIFICATION_TABS, type NotificationData, type NotificationTab } from '@talad/shared';
import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { MediaService } from '../media/media.service.js';
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

function inTab(customerId: string, tab?: NotificationTab): Prisma.NotificationWhereInput {
  return { customerId, ...(tab && { type: { in: [...NOTIFICATION_TABS[tab]] } }) };
}

/** A customer's in-app notifications (§4.7). Shop-side notifications use `shopId` instead. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

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
    db: Pick<Prisma.TransactionClient, 'notification'>,
    customerId: string,
    type: 'ORDER' | 'PROMOTION' | 'PRICE_DROP' | 'SYSTEM',
    text: { lo: { title: string; body: string }; en: { title: string; body: string } },
    extra: Omit<NotificationData, 'i18n'> = {},
  ): Promise<void> {
    const data: NotificationData = { ...extra, i18n: text };
    await db.notification.create({
      data: { customerId, type, title: text.en.title, body: text.en.body, data: data as object },
    });
  }

  /** Tells a customer their order moved to `status` (shop actions and deadline sweeps). */
  async notifyOrder(
    db: Pick<Prisma.TransactionClient, 'notification'>,
    order: { customerId: string; number: string; shopName: string; imageKey?: string | null },
    status: OrderStatus,
    reason?: string | null,
  ): Promise<void> {
    const text = orderMessage(status, order.number, order.shopName, reason);
    const data: NotificationData = {
      link: `/account/orders/${order.number}`,
      ...(order.imageKey && { imageUrl: order.imageKey }),
      i18n: text,
    };
    await db.notification.create({
      data: { customerId: order.customerId, type: 'ORDER', title: text.en.title, body: text.en.body, data: data as object },
    });
  }

  async markAllRead(customerId: string, tab?: NotificationTab): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { ...inTab(customerId, tab), readAt: null },
      data: { readAt: new Date() },
    });
  }
}

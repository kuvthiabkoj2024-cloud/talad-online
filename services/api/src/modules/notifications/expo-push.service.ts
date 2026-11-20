import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOCALES, type Locale, type RealtimeEvent } from '@talad/shared';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimeService, type Audience } from '../realtime/realtime.service.js';
import { CHAT_TITLE, PROMO_TYPES } from './push-common.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo takes up to 100 messages per request. */
const CHUNK = 100;
/** Newest phones per account; older ones are usually gone anyway. */
export const MAX_PHONES = 5;
const isLocale = (v: unknown): v is Locale => (LOCALES as readonly unknown[]).includes(v);

type NotificationEvent = Extract<RealtimeEvent, { kind: 'notification' | 'message' }>;
/** Which app screen a tap opens: the customer side, or the seller screens (shop notifications). */
export type PushApp = 'customer' | 'seller';
export interface PushCount {
  sent: number;
  failed: number;
}

/** One Expo push message (https://docs.expo.dev/push-notifications/sending-notifications/). */
interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  priority: 'high';
  /** Android notification channel, made by the app: orders, chats, promotions, default. */
  channelId: string;
  /** What the app needs to open the right screen when it's tapped. */
  data: { app: PushApp; link?: string; conversationId?: string; notificationId?: string };
  badge?: number;
}

/**
 * Push to the phone app through Expo's push service (Android via Firebase FCM, iPhone via Apple).
 * Like Web Push (push.service.ts) it rides on the realtime events: every committed `notification`
 * and `message` also goes to the recipient's phones. Shop notifications go to the shop owner's
 * phones (one account buys and sells) and open the seller screens. Customers who turned
 * promotions off get no promotion pushes. Phones that uninstalled the app are forgotten.
 */
@Injectable()
export class ExpoPushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpoPushService.name);
  private readonly accessToken: string | undefined;
  private unhook: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    config: ConfigService<Env, true>,
  ) {
    this.accessToken = config.get('EXPO_ACCESS_TOKEN', { infer: true }) || undefined;
  }

  onModuleInit() {
    this.unhook = this.realtime.onCommitted((to, event) => {
      if (event.kind !== 'notification' && event.kind !== 'message') return;
      void this.deliver(to, event).catch((e: unknown) => this.logger.warn(`Phone push failed: ${e instanceof Error ? e.message : String(e)}`));
    });
  }

  onModuleDestroy() {
    this.unhook?.();
  }

  /** A notification or chat message, to each recipient's phones, with their unread count as the badge. */
  async deliver(to: Audience[], event: NotificationEvent): Promise<void> {
    for (const audience of to) {
      const [kind, id] = audience.split(':') as ['customer' | 'shop' | 'admin', string];
      if (kind === 'admin') continue;
      const ownerId = kind === 'customer' ? id : (await this.prisma.shop.findUnique({ where: { id }, select: { ownerId: true } }))?.ownerId;
      if (!ownerId) continue;
      if (kind === 'customer' && event.kind === 'notification' && PROMO_TYPES.has(event.type) && !(await this.promotionsOn(ownerId))) continue;
      const phones = await this.prisma.pushDevice.findMany({ where: { customerId: ownerId }, orderBy: { updatedAt: 'desc' }, take: MAX_PHONES });
      if (!phones.length) continue;
      const badge = await this.unread(kind, id);
      const app: PushApp = kind === 'shop' ? 'seller' : 'customer';
      await this.post(phones.map((p) => ({ ...this.message(p.token, event, app, isLocale(p.locale) ? p.locale : 'lo'), badge })));
    }
  }

  /**
   * The same notification to many accounts' phones at once (admin broadcasts). `app: 'seller'`
   * opens the seller screens. The caller has already left out customers who turned promotions off.
   */
  async sendToAccounts(customerIds: string[], event: NotificationEvent, app: PushApp): Promise<PushCount> {
    if (!customerIds.length) return { sent: 0, failed: 0 };
    const phones = await this.prisma.pushDevice.findMany({ where: { customerId: { in: customerIds } }, select: { token: true, locale: true } });
    return this.post(phones.map((p) => this.message(p.token, event, app, isLocale(p.locale) ? p.locale : 'lo')));
  }

  private message(token: string, event: NotificationEvent, app: PushApp, locale: Locale): ExpoMessage {
    const base = { to: token, sound: 'default' as const, priority: 'high' as const };
    if (event.kind === 'message') {
      return { ...base, title: CHAT_TITLE[locale](event.from), body: event.preview, channelId: 'chats', data: { app, conversationId: event.conversationId } };
    }
    const text = event.i18n?.[locale] ?? { title: event.title, body: event.body };
    const channelId = event.type === 'ORDER' ? 'orders' : PROMO_TYPES.has(event.type) ? 'promotions' : 'default';
    // A shop's notification on the owner's phone: marked, so it isn't mistaken for their own shopping.
    const title = app === 'seller' ? `🏪 ${text.title}` : text.title;
    return { ...base, title, body: text.body, channelId, data: { app, ...(event.link && { link: event.link }), notificationId: event.id } };
  }

  /** Sends in chunks; phones Expo says are gone (app uninstalled, signed out) are forgotten. */
  private async post(messages: ExpoMessage[]): Promise<PushCount> {
    const count = { sent: 0, failed: 0 };
    for (let i = 0; i < messages.length; i += CHUNK) {
      const chunk = messages.slice(i, i + CHUNK);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
            ...(this.accessToken && { Authorization: `Bearer ${this.accessToken}` }),
          },
          body: JSON.stringify(chunk),
        });
        const body = (await res.json().catch(() => ({}))) as { data?: { status: 'ok' | 'error'; details?: { error?: string } }[] };
        if (!res.ok || !Array.isArray(body.data)) throw new Error(`Expo push HTTP ${res.status}`);
        const gone: string[] = [];
        body.data.forEach((ticket, j) => {
          if (ticket.status === 'ok') count.sent++;
          else {
            count.failed++;
            if (ticket.details?.error === 'DeviceNotRegistered') gone.push(chunk[j]!.to);
          }
        });
        if (gone.length) await this.prisma.pushDevice.deleteMany({ where: { token: { in: gone } } });
      } catch (e) {
        count.failed += chunk.length;
        this.logger.warn(`Expo push failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return count;
  }

  private async promotionsOn(customerId: string): Promise<boolean> {
    const c = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { promoNotifications: true } });
    return c?.promoNotifications ?? false;
  }

  /** The app icon's number: unread notifications plus unread chat messages (as for Web Push). */
  private async unread(kind: 'customer' | 'shop', id: string): Promise<number> {
    const [notifications, chats] = await Promise.all([
      this.prisma.notification.count({ where: kind === 'customer' ? { customerId: id, readAt: null } : { shopId: id, readAt: null } }),
      this.prisma.shopConversation.aggregate({
        where: kind === 'customer' ? { customerId: id } : { shopId: id },
        _sum: { customerUnread: true, shopUnread: true },
      }),
    ]);
    return notifications + ((kind === 'customer' ? chats._sum.customerUnread : chats._sum.shopUnread) ?? 0);
  }
}

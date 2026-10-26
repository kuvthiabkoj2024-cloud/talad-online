import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LOCALES, type Locale, type RealtimeEvent } from '@talad/shared';
import webpush from 'web-push';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RealtimeService, type Audience } from '../realtime/realtime.service.js';

/** A browser's `PushSubscription.toJSON()`, plus the app's language. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale?: string;
}

/** What the service workers (apps/web/public/sw.js, apps/shop/public/sw.js) show. */
interface PushPayload {
  title: string;
  body: string;
  /** Path on the app's own origin to open when it's tapped. */
  url: string;
  /** Same tag = replaces the earlier one (e.g. one entry per chat). */
  tag: string;
}

const CHAT_TITLE: Record<Locale, (name: string) => string> = {
  lo: (name) => `ຂໍ້ຄວາມໃໝ່ຈາກ ${name}`,
  en: (name) => `New message from ${name}`,
};
/** Newest browsers per recipient; older ones are usually gone anyway. */
const MAX_DEVICES = 10;
const DAY_S = 86_400;
const isLocale = (v: unknown): v is Locale => (LOCALES as readonly unknown[]).includes(v);

/**
 * Web Push to desktop browsers and installed PWAs (storefront for customers, Seller Center for
 * shops). It rides on the realtime events: every `notification` and `message` event, once
 * committed, is also sent to the recipient's subscribed browsers, so it shows up as a system
 * notification when the site is closed or in the background. Off without VAPID keys.
 */
@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushService.name);
  private readonly publicKey: string | null;
  private unhook: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    config: ConfigService<Env, true>,
  ) {
    const pub = config.get('VAPID_PUBLIC_KEY', { infer: true });
    const priv = config.get('VAPID_PRIVATE_KEY', { infer: true });
    this.publicKey = pub && priv ? pub : null;
    if (pub && priv) webpush.setVapidDetails(config.get('VAPID_SUBJECT', { infer: true }), pub, priv);
  }

  onModuleInit() {
    if (!this.publicKey) {
      this.logger.log('Web Push is off (no VAPID keys)');
      return;
    }
    this.unhook = this.realtime.onCommitted((to, event) => void this.deliver(to, event));
  }

  onModuleDestroy() {
    this.unhook?.();
  }

  /** The key browsers subscribe with; null while push is off. */
  config(): { publicKey: string | null } {
    return { publicKey: this.publicKey };
  }

  /** Saves this browser for `owner` (it moves over if another account used it before). */
  async subscribe(owner: { customerId: string } | { shopId: string }, input: PushSubscriptionInput): Promise<void> {
    const locale = isLocale(input.locale) ? input.locale : 'lo';
    const target = { customerId: null, shopId: null, ...owner, locale, p256dh: input.keys.p256dh, auth: input.keys.auth };
    await this.prisma.pushSubscription.upsert({ where: { endpoint: input.endpoint }, create: { endpoint: input.endpoint, ...target }, update: target });
  }

  /** Forgets this browser (turned off, or signing out). */
  async unsubscribe(owner: { customerId: string } | { shopId: string }, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({ where: { endpoint, ...owner } });
  }

  private async deliver(to: Audience[], event: RealtimeEvent): Promise<void> {
    if (event.kind !== 'notification' && event.kind !== 'message') return;
    for (const audience of to) {
      const [kind, id] = audience.split(':') as ['customer' | 'shop' | 'admin', string];
      if (kind === 'admin') continue;
      const subs = await this.prisma.pushSubscription.findMany({
        where: kind === 'customer' ? { customerId: id } : { shopId: id },
        orderBy: { updatedAt: 'desc' },
        take: MAX_DEVICES,
        select: { id: true, endpoint: true, p256dh: true, auth: true, locale: true },
      });
      await Promise.all(subs.map((s) => this.send(s, payloadFor(event, kind, isLocale(s.locale) ? s.locale : 'lo'))));
    }
  }

  private async send(sub: { id: string; endpoint: string; p256dh: string; auth: string }, payload: PushPayload): Promise<void> {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), {
        TTL: DAY_S,
        urgency: 'high',
        // A chat's later message replaces one the phone hasn't fetched yet.
        ...(payload.tag.startsWith('chat-') && { topic: payload.tag.slice(5).replaceAll('-', '') }),
      });
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      // The browser unsubscribed or the subscription expired: stop sending to it.
      if (status === 404 || status === 410) await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
      else this.logger.warn(`Push failed (${status ?? (e instanceof Error ? e.message : String(e))})`);
    }
  }
}

/** Storefront paths carry the language (`/lo/...`); Seller Center paths don't. */
function payloadFor(event: Extract<RealtimeEvent, { kind: 'notification' | 'message' }>, app: 'customer' | 'shop', locale: Locale): PushPayload {
  const at = (path: string) => (app === 'customer' ? `/${locale}${path}` : path);
  if (event.kind === 'message') {
    return { title: CHAT_TITLE[locale](event.from), body: event.preview, url: at(`/messages/${event.conversationId}`), tag: `chat-${event.conversationId}` };
  }
  const text = event.i18n?.[locale] ?? { title: event.title, body: event.body };
  return { ...text, url: at(event.link ?? (app === 'customer' ? '/notifications' : '/')), tag: event.id };
}

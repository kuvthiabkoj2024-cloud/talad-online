import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  nextBroadcastRun,
  type BroadcastAudience,
  type BroadcastContent,
  type BroadcastRepeat,
  type RealtimeEvent,
} from '@talad/shared';
import type { AdminUser, Broadcast, Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { SmsService } from '../../auth/sms.service.js';
import { ExpoPushService, type PushCount } from '../expo-push.service.js';
import { PushService } from '../push.service.js';
import type { AudienceCountQuery, CreateBroadcastDto } from './broadcasts.dto.js';

/** How often due broadcasts are looked for. */
const TICK_MS = 30_000;
/** Recipients handled per batch (inbox rows and pushes). */
const BATCH = 500;

/** What one send reached. */
export interface BroadcastResult {
  recipients: number;
  inApp: number;
  pushSent: number;
  pushFailed: number;
  smsSent: number;
  smsFailed: number;
  error?: string;
}

/** One account to send to: its customer id (phones, SMS), and its shop id for shop broadcasts. */
interface Target {
  customerId: string;
  shopId?: string;
  promotions: boolean;
  phone: string | null;
  locale: string;
}

const isSingle = (a: BroadcastAudience) => a === 'customer' || a === 'shop';
const empty = (): BroadcastResult => ({ recipients: 0, inApp: 0, pushSent: 0, pushFailed: 0, smsSent: 0, smsFailed: 0 });

/**
 * Admin messages to customers or shops (all, or one) by in-app inbox, push (phone app + website
 * PWA) and SMS (one person only), sent now, at a time, every day or on chosen weekdays (Vientiane
 * time). A timer finds due broadcasts; each send is claimed in the database first (nextRunAt moves
 * on), so a restart or a second API instance never sends it twice. Missed runs (API down) are
 * skipped, not sent late in a burst. Customers who turned promotions off get no PROMOTION push or
 * SMS; the in-app inbox always gets it.
 */
@Injectable()
export class BroadcastsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BroadcastsService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly phones: ExpoPushService,
    private readonly web: PushService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async create(admin: AdminUser, dto: CreateBroadcastDto) {
    const single = isSingle(dto.audience);
    if (dto.audience === 'customer' && !dto.targetCustomerId) throw invalid('TARGET_REQUIRED', 'Choose the customer');
    if (dto.audience === 'shop' && !dto.targetShopId) throw invalid('TARGET_REQUIRED', 'Choose the shop');
    if (!single && dto.channels.includes('SMS')) throw invalid('SMS_SINGLE_ONLY', 'SMS can only go to one customer or shop');
    if (dto.repeat === 'WEEKLY' && !dto.weekdays?.length) throw invalid('WEEKDAYS_REQUIRED', 'Choose at least one weekday');
    const now = new Date();
    // A time in the past (or none) means now.
    const startAt = dto.startAt && new Date(dto.startAt).getTime() > now.getTime() ? new Date(dto.startAt) : now;
    const endAt = dto.repeat !== 'ONCE' && dto.endAt ? new Date(dto.endAt) : null;
    if (endAt && endAt.getTime() <= startAt.getTime()) throw invalid('END_BEFORE_START', 'The end must be after the first send');
    if (dto.audience === 'customer' && !(await this.prisma.customer.count({ where: { id: dto.targetCustomerId, isActive: true } }))) {
      throw invalid('TARGET_NOT_FOUND', 'Customer not found');
    }
    if (dto.audience === 'shop' && !(await this.prisma.shop.count({ where: { id: dto.targetShopId } }))) throw invalid('TARGET_NOT_FOUND', 'Shop not found');

    const schedule = { repeat: dto.repeat as BroadcastRepeat, startAt, endAt, weekdays: dto.weekdays ?? [] };
    const nextRunAt = nextBroadcastRun(schedule, new Date(startAt.getTime() - 1));
    if (!nextRunAt) throw invalid('NO_RUN', 'This schedule never sends (check the weekdays and the end date)');
    const row = await this.prisma.broadcast.create({
      data: {
        audience: dto.audience,
        targetCustomerId: dto.audience === 'customer' ? dto.targetCustomerId : null,
        targetShopId: dto.audience === 'shop' ? dto.targetShopId : null,
        type: dto.type,
        channels: dto.channels,
        content: {
          lo: { title: dto.content.lo.title, body: dto.content.lo.body },
          en: { title: dto.content.en.title, body: dto.content.en.body },
        },
        link: dto.link ?? null,
        repeat: dto.repeat,
        weekdays: dto.repeat === 'WEEKLY' ? (dto.weekdays ?? []) : [],
        startAt,
        endAt,
        nextRunAt,
        createdById: admin.id,
      },
    });
    await this.audit.log({
      adminId: admin.id,
      action: 'broadcast.create',
      entityType: 'Broadcast',
      entityId: row.id,
      changes: { audience: dto.audience, channels: dto.channels, repeat: dto.repeat, title: dto.content.en.title, startAt: startAt.toISOString() },
    });
    // "Send now": don't wait for the next tick.
    if (nextRunAt.getTime() <= Date.now()) void this.tick();
    return this.view(row.id);
  }

  async list() {
    const rows = await this.prisma.broadcast.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { createdBy: { select: { name: true } } } });
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  async pause(admin: AdminUser, id: string) {
    const { count } = await this.prisma.broadcast.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'PAUSED' } });
    if (!count) throw new NotFoundException({ code: 'NOT_ACTIVE', message: 'Not an active broadcast' });
    await this.audit.log({ adminId: admin.id, action: 'broadcast.pause', entityType: 'Broadcast', entityId: id });
    return this.view(id);
  }

  /** Back on: the next send is worked out from now (missed ones aren't sent). */
  async resume(admin: AdminUser, id: string) {
    const b = await this.prisma.broadcast.findUnique({ where: { id } });
    if (!b || b.status !== 'PAUSED') throw new NotFoundException({ code: 'NOT_PAUSED', message: 'Not a paused broadcast' });
    const next = nextBroadcastRun(scheduleOf(b), new Date());
    await this.prisma.broadcast.update({ where: { id }, data: next ? { status: 'ACTIVE', nextRunAt: next } : { status: 'DONE', nextRunAt: null } });
    await this.audit.log({ adminId: admin.id, action: 'broadcast.resume', entityType: 'Broadcast', entityId: id });
    return this.view(id);
  }

  async remove(admin: AdminUser, id: string) {
    const { count } = await this.prisma.broadcast.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Broadcast not found');
    await this.audit.log({ adminId: admin.id, action: 'broadcast.delete', entityType: 'Broadcast', entityId: id });
  }

  /** The "one customer / one shop" picker: by name or phone. */
  async searchTargets(kind: 'customer' | 'shop', q: string) {
    const digits = q.replace(/\D/g, '');
    if (kind === 'customer') {
      const rows = await this.prisma.customer.findMany({
        where: { isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] },
        select: { id: true, name: true, phone: true, _count: { select: { pushDevices: true } } },
        take: 10,
        orderBy: { name: 'asc' },
      });
      return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, phones: r._count.pushDevices }));
    }
    const rows = await this.prisma.shop.findMany({
      where: { OR: [{ name: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : [])] },
      select: { id: true, name: true, phone: true, status: true },
      take: 10,
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, status: r.status }));
  }

  /** How many accounts a broadcast would reach, and how many have the app / web push. */
  async countAudience(q: AudienceCountQuery) {
    const where = this.customerWhere(q.audience, q.targetCustomerId, q.targetShopId);
    const [recipients, phones, browsers] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.pushDevice.count({ where: { customer: where } }),
      q.audience === 'sellers' || q.audience === 'shop'
        ? this.prisma.pushSubscription.count({ where: { shop: { owner: where } } })
        : this.prisma.pushSubscription.count({ where: { customer: where } }),
    ]);
    return { recipients, phones, browsers };
  }

  /** Sends whatever is due. One tick at a time; each broadcast is claimed before it's sent. */
  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const due = await this.prisma.broadcast.findMany({ where: { status: 'ACTIVE', nextRunAt: { lte: now } }, orderBy: { nextRunAt: 'asc' }, take: 10 });
      for (const b of due) {
        const next = nextBroadcastRun(scheduleOf(b), now);
        const { count } = await this.prisma.broadcast.updateMany({
          where: { id: b.id, status: 'ACTIVE', nextRunAt: b.nextRunAt },
          data: { nextRunAt: next, status: next ? 'ACTIVE' : 'DONE', runs: { increment: 1 }, lastRunAt: now },
        });
        if (!count) continue; // another instance took it
        let result: BroadcastResult;
        try {
          result = await this.run(b, b.runs + 1);
        } catch (e) {
          result = { ...empty(), error: e instanceof Error ? e.message : String(e) };
          this.logger.error(`Broadcast ${b.id} failed: ${result.error}`);
        }
        await this.prisma.broadcast.update({ where: { id: b.id }, data: { lastResult: result as unknown as Prisma.InputJsonValue } });
      }
    } catch (e) {
      this.logger.error(`Broadcast tick failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      this.running = false;
    }
  }

  /** One send of a broadcast to its whole audience, batch by batch. */
  async run(b: Broadcast, run: number): Promise<BroadcastResult> {
    const content = b.content as unknown as BroadcastContent;
    const result = empty();
    const toShops = b.audience === 'sellers' || b.audience === 'shop';
    const promo = b.type === 'PROMOTION';
    const event: Extract<RealtimeEvent, { kind: 'notification' }> = {
      kind: 'notification',
      id: `broadcast-${b.id}-${run}`,
      type: toShops ? 'SYSTEM' : b.type,
      title: content.en.title,
      body: content.en.body,
      i18n: content,
      ...(b.link && { link: b.link }),
    };
    const data = { ...(b.link && { link: b.link }), i18n: content, broadcastId: b.id } as Prisma.InputJsonValue;
    const add = (c: PushCount) => {
      result.pushSent += c.sent;
      result.pushFailed += c.failed;
    };

    for await (const batch of this.targets(b)) {
      result.recipients += batch.length;
      if (b.channels.includes('IN_APP')) {
        const rows = batch.map((t) =>
          toShops
            ? { shopId: t.shopId!, type: 'SYSTEM', title: content.en.title, body: content.en.body, data }
            : { customerId: t.customerId, type: b.type, title: content.en.title, body: content.en.body, data },
        );
        result.inApp += (await this.prisma.notification.createMany({ data: rows })).count;
      }
      // Promotions skip customers who turned them off; MC Mart news (SYSTEM) and shops always get it.
      const pushable = batch.filter((t) => toShops || !promo || t.promotions);
      if (b.channels.includes('PUSH') && pushable.length) {
        add(await this.phones.sendToAccounts(pushable.map((t) => t.customerId), event, toShops ? 'seller' : 'customer'));
        add(await this.web.sendToMany(toShops ? 'shop' : 'customer', pushable.map((t) => (toShops ? t.shopId! : t.customerId)), event));
      }
      if (b.channels.includes('SMS') && isSingle(b.audience as BroadcastAudience)) {
        for (const t of pushable) {
          if (!t.phone) {
            result.smsFailed++;
            continue;
          }
          const text = t.locale === 'en' ? content.en : content.lo;
          try {
            await this.sms.send(t.phone, `${text.title}\n${text.body}`);
            result.smsSent++;
          } catch {
            result.smsFailed++;
          }
        }
      }
    }
    return result;
  }

  /** The audience in batches: active customers, or approved shops with an active owner. */
  private async *targets(b: Broadcast): AsyncGenerator<Target[]> {
    const where = this.customerWhere(b.audience as BroadcastAudience, b.targetCustomerId, b.targetShopId);
    let cursor: string | undefined;
    for (;;) {
      const rows = await this.prisma.customer.findMany({
        where,
        select: { id: true, phone: true, locale: true, promoNotifications: true, shop: { select: { id: true, phone: true } } },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });
      if (!rows.length) return;
      yield rows.map((r) => ({
        customerId: r.id,
        shopId: r.shop?.id,
        promotions: r.promoNotifications,
        // A shop's SMS goes to the shop's own number.
        phone: b.audience === 'shop' ? (r.shop?.phone ?? r.phone) : r.phone,
        locale: r.locale,
      }));
      if (rows.length < BATCH) return;
      cursor = rows[rows.length - 1]!.id;
    }
  }

  /** The accounts behind an audience (shops are reached through their owner's account). */
  private customerWhere(audience: BroadcastAudience, customerId?: string | null, shopId?: string | null): Prisma.CustomerWhereInput {
    switch (audience) {
      case 'customers':
        return { isActive: true };
      case 'sellers':
        return { isActive: true, shop: { status: 'APPROVED' } };
      case 'customer':
        return { isActive: true, id: customerId ?? '' };
      case 'shop':
        return { isActive: true, shop: { id: shopId ?? '' } };
    }
  }

  private async view(id: string) {
    const row = await this.prisma.broadcast.findUnique({ where: { id }, include: { createdBy: { select: { name: true } } } });
    if (!row) throw new NotFoundException('Broadcast not found');
    return this.toView(row);
  }

  private async toView(r: Broadcast & { createdBy: { name: string } | null }) {
    const target =
      r.targetCustomerId
        ? await this.prisma.customer.findUnique({ where: { id: r.targetCustomerId }, select: { name: true, phone: true } })
        : r.targetShopId
          ? await this.prisma.shop.findUnique({ where: { id: r.targetShopId }, select: { name: true, phone: true } })
          : null;
    return {
      id: r.id,
      audience: r.audience,
      target: target && { name: target.name, phone: target.phone },
      type: r.type,
      channels: r.channels,
      content: r.content as unknown as BroadcastContent,
      link: r.link,
      repeat: r.repeat,
      weekdays: r.weekdays,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
      nextRunAt: r.nextRunAt,
      lastRunAt: r.lastRunAt,
      runs: r.runs,
      lastResult: r.lastResult as BroadcastResult | null,
      createdBy: r.createdBy?.name ?? null,
      createdAt: r.createdAt,
    };
  }
}

function scheduleOf(b: Pick<Broadcast, 'repeat' | 'startAt' | 'endAt' | 'weekdays'>) {
  return { repeat: b.repeat as BroadcastRepeat, startAt: b.startAt, endAt: b.endAt, weekdays: b.weekdays };
}

function invalid(code: string, message: string) {
  return new BadRequestException({ code, message });
}

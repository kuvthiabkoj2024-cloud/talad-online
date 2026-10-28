import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { addSold, markCodPaid, moveOrder, restoreStock, returnPoints } from './order-transitions.js';

const EVERY = 5 * 60_000;

/**
 * Order deadlines (§3.6), checked every few minutes in-process:
 * - unpaid orders are cancelled when the payment window ends, unless slips are waiting for
 *   (or passed) Taladonline's check — rejected slips don't count;
 * - sent orders complete AUTO_COMPLETE_DAYS after shipping unless the customer confirmed
 *   sooner (they count as sold and cash on delivery as paid, but earn no loyalty points).
 */
@Injectable()
export class OrderDeadlinesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderDeadlinesService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timer = setInterval(() => void this.sweep(), EVERY);
    this.timer.unref();
    void this.sweep();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async sweep(now = new Date()): Promise<{ cancelled: number; completed: number }> {
    if (this.running) return { cancelled: 0, completed: 0 };
    this.running = true;
    try {
      const unpaid = await this.prisma.shopOrder.findMany({
        where: {
          status: 'PENDING',
          paymentDueAt: { lt: now },
          payments: { none: { status: 'PAID' } },
          order: { slips: { none: { status: { in: ['PENDING', 'APPROVED'] } } } },
        },
        select: this.select,
      });
      let cancelled = 0;
      for (const o of unpaid) {
        const note = 'Payment not received in time';
        const done = await this.prisma.$transaction(async (tx) => {
          if (!(await moveOrder(tx, o.id, 'PENDING', 'CANCELLED', { cancelReason: note }, { actorType: null, actorId: null, note }))) {
            return false;
          }
          await restoreStock(tx, o.id);
          await returnPoints(tx, o.id);
          await tx.payment.updateMany({ where: { shopOrderId: o.id, status: 'PENDING' }, data: { status: 'EXPIRED' } });
          await this.notifications.notifyOrder(tx, this.target(o), 'CANCELLED', note);
          return true;
        });
        if (done) cancelled++;
      }

      const sent = await this.prisma.shopOrder.findMany({
        where: { status: { in: ['SHIPPED', 'DELIVERED'] }, autoConfirmAt: { lt: now } },
        select: { ...this.select, status: true },
      });
      let completed = 0;
      for (const o of sent) {
        const done = await this.prisma.$transaction(async (tx) => {
          const note = 'Confirmed automatically';
          if (!(await moveOrder(tx, o.id, o.status, 'COMPLETED', {}, { actorType: null, actorId: null, note }))) return false;
          await markCodPaid(tx, o.id);
          await addSold(tx, o.id);
          // No loyalty points: only an order the customer confirms earns them.
          await this.notifications.notifyOrder(tx, this.target(o), 'COMPLETED');
          return true;
        });
        if (done) completed++;
      }
      if (cancelled || completed) this.logger.log(`Deadlines: ${cancelled} unpaid cancelled, ${completed} completed`);
      return { cancelled, completed };
    } catch (e) {
      this.logger.error(`Deadline sweep failed: ${(e as Error).message}`);
      return { cancelled: 0, completed: 0 };
    } finally {
      this.running = false;
    }
  }

  private readonly select = {
    id: true,
    number: true,
    shop: { select: { name: true } },
    order: { select: { customerId: true } },
    items: { take: 1, select: { product: { select: { images: { orderBy: { sortOrder: 'asc' as const }, take: 1, select: { key: true } } } } } },
  };

  private target(o: { number: string; shop: { name: string }; order: { customerId: string }; items: { product: { images: { key: string }[] } }[] }) {
    return { customerId: o.order.customerId, number: o.number, shopName: o.shop.name, imageKey: o.items[0]?.product.images[0]?.key };
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PlatformAccountService, type PlatformAccount } from './platform-account.service.js';

/** Months are counted in Laos time. */
const TZ = '+07:00';
const num = (d: Prisma.Decimal | null | undefined) => d?.toNumber() ?? 0;

export interface CodMonth {
  /** `YYYY-MM` */
  month: string;
  /** First moment of the month and of the next one (Laos time). */
  from: Date;
  to: Date;
  /** Completed COD orders this month: what customers paid the shop in cash. */
  orders: number;
  sales: number;
  /** Taladonline's commission on them (each item at its own rate), to transfer at month end. */
  commission: number;
  /** commission ÷ sales, in percent (one decimal). */
  rate: number;
  /**
   * Discounts Taladonline funds on these orders (customers' points, platform coupons): the shop
   * collected less cash, so this comes off what it owes.
   */
  credit: number;
  /** commission − credit; negative = Taladonline owes the shop that much. */
  toTransfer: number;
  /** COD orders still on their way: they count in the month they complete. */
  inProgress: { orders: number; sales: number };
  items: { number: string; completedAt: Date; customer: string; sales: number; commission: number; credit: number }[];
  /** Where to send the commission. */
  account: PlatformAccount | null;
}

/** `YYYY-MM` of `d` in Laos time. */
const monthOf = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);

/**
 * Cash on delivery for the shop (§6): the shop keeps the cash, so Taladonline's commission on
 * COD sales is not deducted from a payout — the shop transfers it at the end of each month.
 */
@Injectable()
export class ShopCodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly account: PlatformAccountService,
  ) {}

  async month(shopId: string, month?: string): Promise<CodMonth> {
    const m = month ?? monthOf(new Date());
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw new BadRequestException({ code: 'INVALID_MONTH', message: 'Use YYYY-MM' });
    const [y, mo] = m.split('-').map(Number);
    const from = new Date(`${m}-01T00:00:00${TZ}`);
    const to = new Date(`${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01T00:00:00${TZ}`);
    const cod = { payments: { some: { method: 'COD' as const } } };

    const [rows, inProgress, account] = await Promise.all([
      this.prisma.shopOrder.findMany({
        where: { shopId, status: 'COMPLETED', ...cod, history: { some: { toStatus: 'COMPLETED', createdAt: { gte: from, lt: to } } } },
        select: {
          number: true,
          total: true,
          commissionAmount: true,
          platformDiscount: true,
          order: { select: { customer: { select: { name: true } } } },
          history: { where: { toStatus: 'COMPLETED' }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      }),
      this.prisma.shopOrder.aggregate({
        where: { shopId, status: { in: ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'] }, ...cod },
        _count: { _all: true },
        _sum: { total: true },
      }),
      this.account.available(),
    ]);
    const items = rows
      .map((r) => ({
        number: r.number,
        completedAt: r.history[0]!.createdAt,
        customer: r.order.customer.name,
        sales: num(r.total),
        commission: num(r.commissionAmount),
        credit: num(r.platformDiscount),
      }))
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
    const sales = items.reduce((s, i) => s + i.sales, 0);
    const commission = items.reduce((s, i) => s + i.commission, 0);
    const credit = items.reduce((s, i) => s + i.credit, 0);
    return {
      month: m,
      from,
      to,
      orders: items.length,
      sales,
      commission,
      rate: sales > 0 ? Math.round((commission / sales) * 1000) / 10 : 0,
      credit,
      toTransfer: commission - credit,
      inProgress: { orders: inProgress._count._all, sales: num(inProgress._sum.total) },
      items,
      account,
    };
  }

  platformQr() {
    return this.account.qr();
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { formatMoney, SHOP_PROFILE_RULES } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import type { AdminUser, CodTransferStatus, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { detectImage } from '../media/image-type.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
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
  /** MC Mart's commission on them (each item at its own rate), to transfer at month end. */
  commission: number;
  /** commission ÷ sales, in percent (one decimal). */
  rate: number;
  /**
   * Discounts MC Mart funds on these orders (customers' points, platform coupons): the shop
   * collected less cash, so this comes off what it owes.
   */
  credit: number;
  /** commission − credit; negative = MC Mart owes the shop that much. */
  toTransfer: number;
  /** COD orders still on their way: they count in the month they complete. */
  inProgress: { orders: number; sales: number };
  items: { number: string; completedAt: Date; customer: string; sales: number; commission: number; credit: number }[];
  /** Where to send the commission. */
  account: PlatformAccount | null;
  /** The shop's transfer slips for this month, newest first. */
  transfers: CodTransferView[];
  /** toTransfer minus what MC Mart confirmed (and minus slips still being checked). */
  remaining: number;
}

export interface CodTransferView {
  id: string;
  month: string;
  amount: number;
  note: string | null;
  status: CodTransferStatus;
  rejectReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

const transferSelect = { id: true, month: true, amount: true, note: true, status: true, rejectReason: true, createdAt: true, reviewedAt: true } satisfies Prisma.CodTransferSelect;
const transferView = (t: Prisma.CodTransferGetPayload<{ select: typeof transferSelect }>): CodTransferView => ({ ...t, amount: num(t.amount) });
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `YYYY-MM` of `d` in Laos time. */
const monthOf = (d: Date) => new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);

/**
 * Cash on delivery for the shop (§6): the shop keeps the cash, so MC Mart's commission on
 * COD sales is not deducted from a payout — the shop transfers it at the end of each month.
 */
@Injectable()
export class ShopCodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly account: PlatformAccountService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async month(shopId: string, month?: string): Promise<CodMonth> {
    const m = month ?? monthOf(new Date());
    if (!MONTH.test(m)) throw new BadRequestException({ code: 'INVALID_MONTH', message: 'Use YYYY-MM' });
    const [y, mo] = m.split('-').map(Number);
    const from = new Date(`${m}-01T00:00:00${TZ}`);
    const to = new Date(`${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01T00:00:00${TZ}`);
    const cod = { payments: { some: { method: 'COD' as const } } };

    const [rows, inProgress, account, transfers] = await Promise.all([
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
      this.prisma.codTransfer.findMany({ where: { shopId, month: m }, orderBy: { createdAt: 'desc' }, select: transferSelect }),
    ]);
    const items = rows
      // A return that was refused completes the order again: it counts in the latest month only.
      .filter((r) => r.history[0]!.createdAt >= from && r.history[0]!.createdAt < to)
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
      transfers: transfers.map(transferView),
      remaining: Math.max(0, commission - credit - transfers.filter((t) => t.status !== 'REJECTED').reduce((n, t) => n + num(t.amount), 0)),
    };
  }

  /** The shop sends the slip of its commission transfer for `month` (multipart `file`). */
  async submit(shop: { id: string; name: string }, dto: { month: string; amount: number; note?: string }, file: Express.Multer.File | undefined): Promise<CodTransferView> {
    if (!MONTH.test(dto.month)) throw new BadRequestException({ code: 'INVALID_MONTH', message: 'Use YYYY-MM' });
    if (!file) throw new BadRequestException({ code: 'SLIP_REQUIRED', message: 'Add a photo of the transfer slip' });
    if (file.size > SHOP_PROFILE_RULES.imageMaxBytes) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Image must be 5 MB or smaller' });
    const kind = detectImage(file.buffer);
    if (!kind) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Upload a PNG, JPG or WebP image' });
    if (!(dto.amount > 0)) throw new BadRequestException({ code: 'INVALID_AMOUNT', message: 'Enter the amount you transferred' });
    if (dto.month > monthOf(new Date())) throw new BadRequestException({ code: 'INVALID_MONTH', message: 'That month has not started yet' });
    const key = `${filePrefix(storageFolder.shopPayouts(shop.id), 'cod-transfer')}${randomUUID()}.${kind.ext}`;
    await this.storage.put(key, file.buffer, kind.type);
    const note = dto.note?.trim().slice(0, 300) || null;
    const row = await this.prisma.$transaction(async (tx) => {
      const t = await tx.codTransfer.create({ data: { shopId: shop.id, month: dto.month, amount: dto.amount, note, slipKey: key }, select: transferSelect });
      await this.notifications.toAdmins(
        tx,
        'PAYMENT',
        {
          lo: { title: `ຮ້ານໂອນຄ່າຄອມ COD · ${shop.name}`, body: `${formatMoney(dto.amount, 'lo')} ສຳລັບເດືອນ ${dto.month} · ກວດສະລິບ ແລະ ຢືນຢັນ.` },
          en: { title: `COD commission transfer · ${shop.name}`, body: `${formatMoney(dto.amount, 'en')} for ${dto.month} · Check the slip and confirm it.` },
        },
        { link: '/cod-transfers' },
      );
      return t;
    });
    return transferView(row);
  }

  /** The slip photo, for the shop that sent it (or any admin when `shopId` is null). */
  async slip(id: string, shopId: string | null) {
    const t = await this.prisma.codTransfer.findFirst({ where: { id, ...(shopId && { shopId }) }, select: { slipKey: true } });
    if (!t) throw new NotFoundException('Transfer not found');
    return this.storage.get(t.slipKey);
  }

  /** Admin queue: `status` SUBMITTED (default), CONFIRMED, REJECTED or all. */
  async adminList(q: { status?: string; q?: string; page: number; pageSize: number }) {
    const status = (['SUBMITTED', 'CONFIRMED', 'REJECTED'] as const).find((s) => s === q.status);
    const where: Prisma.CodTransferWhereInput = {
      ...(q.status !== 'all' && { status: status ?? 'SUBMITTED' }),
      ...(q.q && { shop: { name: { contains: q.q, mode: 'insensitive' } } }),
    };
    const [rows, total, submitted] = await Promise.all([
      this.prisma.codTransfer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        select: { ...transferSelect, shop: { select: { id: true, name: true, slug: true } } },
      }),
      this.prisma.codTransfer.count({ where }),
      this.prisma.codTransfer.count({ where: { status: 'SUBMITTED' } }),
    ]);
    const items = await Promise.all(
      rows.map(async ({ shop, ...t }) => ({ ...transferView(t), shop, due: (await this.month(shop.id, t.month)).toTransfer })),
    );
    return { items, page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)), counts: { submitted } };
  }

  /** Admin confirms the money arrived, or rejects the slip with a reason the shop sees. */
  async decide(admin: AdminUser, id: string, decision: 'confirm' | 'reject', reason: string | null, ip?: string) {
    const t = await this.prisma.codTransfer.findUnique({ where: { id }, include: { shop: { select: { id: true } } } });
    if (!t) throw new NotFoundException('Transfer not found');
    if (t.status !== 'SUBMITTED') throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'This transfer was already checked' });
    if (decision === 'reject' && !reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Tell the shop why' });
    const status: CodTransferStatus = decision === 'confirm' ? 'CONFIRMED' : 'REJECTED';
    const amount = num(t.amount);
    await this.prisma.$transaction(async (tx) => {
      await tx.codTransfer.update({ where: { id }, data: { status, rejectReason: decision === 'reject' ? reason : null, reviewedById: admin.id, reviewedAt: new Date() } });
      await this.notifications.toShop(
        tx,
        t.shopId,
        'SYSTEM',
        decision === 'confirm'
          ? {
              lo: { title: 'ໄດ້ຮັບຄ່າຄອມ COD ແລ້ວ', body: `MC Mart ໄດ້ຮັບ ${formatMoney(amount, 'lo')} ສຳລັບເດືອນ ${t.month} ແລ້ວ. ຂອບໃຈ!` },
              en: { title: 'COD commission received', body: `MC Mart received ${formatMoney(amount, 'en')} for ${t.month}. Thank you!` },
            }
          : {
              lo: { title: 'ສະລິບຄ່າຄອມ COD ບໍ່ຜ່ານ', body: `${t.month}: ${reason}. ກະລຸນາສົ່ງສະລິບໃໝ່.` },
              en: { title: 'COD commission slip not accepted', body: `${t.month}: ${reason}. Please send a new slip.` },
            },
        { link: '/cod' },
      );
      await this.audit.log({ adminId: admin.id, action: `codTransfer.${decision}`, entityType: 'CodTransfer', entityId: id, changes: { shop: t.shopId, month: t.month, amount, reason }, ip }, tx);
    });
    return { id, status };
  }

  platformQr() {
    return this.account.qr();
  }
}

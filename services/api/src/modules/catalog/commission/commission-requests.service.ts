import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { commissionOf, type Commission } from '@talad/shared';
import type { AdminUser, CommissionRequestStatus, Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { resolveCommission } from '../../cart/cart.service.js';
import { MediaService } from '../../media/media.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { commissionData, commissionText } from './commission.js';
import type { CommissionRequestDto } from './commission.dto.js';

const DEFAULT_COMMISSION_RATE = 5;
const PAGE_SIZE = 20;

/** Which level a product's commission comes from (most specific wins, §2.3). */
export type CommissionSource = 'PRODUCT' | 'CATEGORY' | 'SHOP' | 'DEFAULT';

export interface EffectiveCommission {
  commission: Commission;
  source: CommissionSource;
}

export interface CommissionRequestView {
  id: string;
  requested: Commission;
  reason: string | null;
  status: CommissionRequestStatus;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

const levels = {
  commissionRate: true,
  commissionFixed: true,
  category: {
    select: { commissionRate: true, commissionFixed: true, name: true, parent: { select: { commissionRate: true, commissionFixed: true } } },
  },
  shop: { select: { commissionRate: true, commissionFixed: true } },
} satisfies Prisma.ProductSelect;

type WithLevels = Prisma.ProductGetPayload<{ select: typeof levels }>;

const view = (r: { id: string; type: Commission['type']; value: Prisma.Decimal; reason: string | null; status: CommissionRequestStatus; reviewNote: string | null; reviewedAt: Date | null; createdAt: Date }): CommissionRequestView => ({
  id: r.id,
  requested: { type: r.type, value: r.value.toNumber() },
  reason: r.reason,
  status: r.status,
  reviewNote: r.reviewNote,
  reviewedAt: r.reviewedAt,
  createdAt: r.createdAt,
});

/**
 * Commission per product (§2.3): a shop asks for its own rate on one product (a percent, or a
 * fixed amount per unit for high-cost goods); once an admin approves, the product pays only
 * that, ahead of its category and the shop, until an admin changes it.
 */
@Injectable()
export class CommissionRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async defaultRate(): Promise<number> {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'defaultCommissionRate' } });
    return typeof setting?.value === 'number' ? setting.value : DEFAULT_COMMISSION_RATE;
  }

  /** What the product pays now and where that comes from; `withoutProduct` skips its own rate. */
  private effective(p: WithLevels, defaultRate: number, withoutProduct = false): EffectiveCommission {
    type Level = Parameters<typeof resolveCommission>[0][number];
    const order: [CommissionSource, Level][] = [
      ...(withoutProduct ? [] : [['PRODUCT', p] as [CommissionSource, Level]]),
      ['CATEGORY', p.category],
      // A subcategory without its own rate takes its parent's.
      ...(p.category.parent ? [['CATEGORY', p.category.parent] as [CommissionSource, Level]] : []),
      ['SHOP', p.shop],
    ];
    for (const [source, level] of order) {
      const c = resolveCommission([level]);
      if (c) return { commission: c, source };
    }
    return { commission: { type: 'PERCENT', value: defaultRate }, source: 'DEFAULT' };
  }

  // ─── Seller Center ─────────────────────────────────────────────────────────

  /** The product's commission now, and its latest request (any status). */
  async forShop(shopId: string, productId: string) {
    const [product, latest, defaultRate] = await Promise.all([
      this.prisma.product.findFirst({ where: { id: productId, shopId }, select: levels }),
      this.prisma.commissionRequest.findFirst({ where: { productId, shopId }, orderBy: { createdAt: 'desc' } }),
      this.defaultRate(),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    return { current: this.effective(product, defaultRate), request: latest ? view(latest) : null };
  }

  async request(shopId: string, productId: string, dto: CommissionRequestDto) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, shopId }, select: { id: true, name: true, shop: { select: { name: true } } } });
    if (!product) throw new NotFoundException('Product not found');
    const requested: Commission = { type: dto.type, value: dto.value };
    commissionData(requested); // checks the limits
    const pending = await this.prisma.commissionRequest.count({ where: { productId, status: 'PENDING' } });
    if (pending) throw new ConflictException({ code: 'REQUEST_PENDING', message: 'A request for this product is already waiting' });

    await this.prisma.$transaction(async (tx) => {
      await tx.commissionRequest.create({ data: { productId, shopId, type: dto.type, value: dto.value, reason: dto.reason ?? null } });
      await this.notifications.toAdmins(
        tx,
        'COMMISSION',
        {
          lo: { title: `ຂໍຄ່າຄອມ ${commissionText(requested, 'lo')}`, body: `${product.shop.name} · ${product.name}` },
          en: { title: `Commission request ${commissionText(requested, 'en')}`, body: `${product.shop.name} · ${product.name}` },
        },
        { link: '/commissions' },
      );
    });
    return this.forShop(shopId, productId);
  }

  async cancel(shopId: string, productId: string) {
    const done = await this.prisma.commissionRequest.updateMany({ where: { productId, shopId, status: 'PENDING' }, data: { status: 'CANCELLED' } });
    if (!done.count) throw new ConflictException({ code: 'NO_PENDING_REQUEST', message: 'There is no request waiting' });
    return this.forShop(shopId, productId);
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  async list(status: CommissionRequestStatus = 'PENDING', page = 1) {
    const where = { status };
    const [rows, total, byStatus, defaultRate] = await Promise.all([
      this.prisma.commissionRequest.findMany({
        where,
        orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          shop: { select: { id: true, name: true } },
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              price: true,
              images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
              ...levels,
            },
          },
        },
      }),
      this.prisma.commissionRequest.count({ where }),
      this.prisma.commissionRequest.groupBy({ by: ['status'], _count: { _all: true } }),
      this.defaultRate(),
    ]);
    const counts = { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 } as Record<CommissionRequestStatus, number>;
    for (const g of byStatus) counts[g.status] = g._count._all;
    return {
      items: rows.map((r) => {
        const own = commissionOf(r.product.commissionRate?.toNumber(), r.product.commissionFixed?.toNumber());
        return {
          ...view(r),
          shop: r.shop,
          product: {
            id: r.product.id,
            name: r.product.name,
            sku: r.product.sku,
            price: r.product.price.toNumber(),
            imageUrl: r.product.images[0] ? this.media.publicUrl(r.product.images[0].key) : null,
            category: r.product.category.name,
          },
          /** What it would pay without its own rate (category, shop or default). */
          standard: this.effective(r.product, defaultRate, true),
          /** Its own rate in force now (null once an admin removed it). */
          productCommission: own,
        };
      }),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      counts,
    };
  }

  async decide(admin: AdminUser, id: string, decision: 'approve' | 'reject', note: string | null, ip?: string) {
    const r = await this.prisma.commissionRequest.findUnique({ where: { id }, include: { product: { select: { id: true, name: true } } } });
    if (!r) throw new NotFoundException('Request not found');
    if (r.status !== 'PENDING') throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'This request was already handled' });
    const requested: Commission = { type: r.type, value: r.value.toNumber() };
    const approve = decision === 'approve';

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.commissionRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: approve ? 'APPROVED' : 'REJECTED', reviewNote: note, reviewedById: admin.id, reviewedAt: new Date() },
      });
      if (!claimed.count) throw new ConflictException({ code: 'ALREADY_REVIEWED', message: 'This request was already handled' });
      if (approve) await tx.product.update({ where: { id: r.productId }, data: commissionData(requested) });
      const reason = (label: string) => (note ? ` ${label}: ${note}` : '');
      await this.notifications.toShop(
        tx,
        r.shopId,
        'SYSTEM',
        approve
          ? {
              lo: { title: 'ອະນຸມັດຄ່າຄອມແລ້ວ', body: `${r.product.name}: ຄ່າຄອມ ${commissionText(requested, 'lo')} ນັບແຕ່ນີ້.${reason('ໝາຍເຫດ')}` },
              en: { title: 'Commission approved', body: `${r.product.name}: ${commissionText(requested, 'en')} commission from now on.${reason('Note')}` },
            }
          : {
              lo: { title: 'ບໍ່ອະນຸມັດຄ່າຄອມ', body: `${r.product.name}: ຄຳຂໍ ${commissionText(requested, 'lo')} ບໍ່ຜ່ານ.${reason('ເຫດຜົນ')}` },
              en: { title: 'Commission request declined', body: `${r.product.name}: ${commissionText(requested, 'en')} was not approved.${reason('Reason')}` },
            },
        { link: `/products/${r.productId}` },
      );
    });
    await this.audit.log({
      adminId: admin.id,
      action: approve ? 'commission.approve' : 'commission.reject',
      entityType: 'Product',
      entityId: r.productId,
      changes: { request: id, ...requested, note },
      ip,
    });
    return { ok: true };
  }

  /** Sets (or with null, removes) a product's own commission directly. */
  async setProduct(admin: AdminUser, productId: string, commission: Commission | null, ip?: string) {
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { shopId: true, name: true, commissionRate: true, commissionFixed: true } });
    if (!product) throw new NotFoundException('Product not found');
    const data = commissionData(commission);
    const before = commissionOf(product.commissionRate?.toNumber(), product.commissionFixed?.toNumber());
    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: productId }, data });
      await this.notifications.toShop(
        tx,
        product.shopId,
        'SYSTEM',
        commission
          ? {
              lo: { title: 'ປ່ຽນຄ່າຄອມສິນຄ້າ', body: `${product.name}: ຄ່າຄອມ ${commissionText(commission, 'lo')} ນັບແຕ່ນີ້.` },
              en: { title: 'Product commission changed', body: `${product.name}: ${commissionText(commission, 'en')} commission from now on.` },
            }
          : {
              lo: { title: 'ຍົກເລີກຄ່າຄອມພິເສດ', body: `${product.name}: ກັບໄປໃຊ້ຄ່າຄອມປົກກະຕິ.` },
              en: { title: 'Special commission removed', body: `${product.name}: back to the standard commission.` },
            },
        { link: `/products/${productId}` },
      );
    });
    await this.audit.log({ adminId: admin.id, action: 'product.commission', entityType: 'Product', entityId: productId, changes: { from: before, to: commission }, ip });
    return { ok: true };
  }
}

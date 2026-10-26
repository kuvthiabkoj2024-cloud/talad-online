import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUser, Prisma, ShopStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import { StorageService } from '../media/storage.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export type ShopDecision = 'approve' | 'reject' | 'suspend' | 'reinstate';

/** Which statuses each decision applies to, and where it leads. */
const DECISIONS: Record<ShopDecision, { from: ShopStatus[]; to: ShopStatus }> = {
  approve: { from: ['PENDING', 'REJECTED'], to: 'APPROVED' },
  reject: { from: ['PENDING'], to: 'REJECTED' },
  suspend: { from: ['APPROVED'], to: 'SUSPENDED' },
  reinstate: { from: ['SUSPENDED'], to: 'APPROVED' },
};

const OWNER_TEXT: Record<ShopDecision, { lo: { title: string; body: string }; en: { title: string; body: string } }> = {
  approve: {
    lo: { title: 'ຮ້ານຂອງທ່ານໄດ້ຮັບການອະນຸມັດແລ້ວ 🎉', body: '{shop} ເປີດຂາຍໃນ Taladonline ແລ້ວ. ສິນຄ້າທີ່ເຜີຍແຜ່ຈະສະແດງໃຫ້ລູກຄ້າເຫັນ.' },
    en: { title: 'Your shop is approved 🎉', body: '{shop} is now open on Taladonline. Published products are visible to customers.' },
  },
  reject: {
    lo: { title: 'ຄຳຮ້ອງເປີດຮ້ານບໍ່ໄດ້ຮັບການອະນຸມັດ', body: 'ເຫດຜົນ: {reason}. ແກ້ໄຂຄຳຮ້ອງໃນສູນຜູ້ຂາຍແລ້ວສົ່ງໃໝ່.' },
    en: { title: 'Your shop application was not approved', body: 'Reason: {reason}. Update it in Seller Center and send it again.' },
  },
  suspend: {
    lo: { title: 'ຮ້ານຂອງທ່ານຖືກລະງັບ', body: 'ເຫດຜົນ: {reason}. ກະລຸນາຕິດຕໍ່ຝ່າຍຊ່ວຍເຫຼືອ Taladonline.' },
    en: { title: 'Your shop has been suspended', body: 'Reason: {reason}. Please contact Taladonline support.' },
  },
  reinstate: {
    lo: { title: 'ຮ້ານຂອງທ່ານເປີດອີກຄັ້ງແລ້ວ', body: '{shop} ກັບມາຂາຍໃນ Taladonline ແລ້ວ.' },
    en: { title: 'Your shop is open again', body: '{shop} is back on Taladonline.' },
  },
};

const fill = (t: { title: string; body: string }, v: Record<string, string>) => ({
  title: t.title.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m),
  body: t.body.replace(/\{(\w+)\}/g, (m, k: string) => v[k] ?? m),
});

/** Shop management for the admin console (§2.3). */
@Injectable()
export class AdminShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
  ) {}

  async list(filter: { status?: ShopStatus; q?: string; page: number; pageSize: number }) {
    const term = filter.q?.trim();
    const where: Prisma.ShopWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { slug: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term.replace(/\D/g, '') || term } },
          { ownerName: { contains: term, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.shop.findMany({
        where,
        // Applications waiting longest first, then newest shops.
        orderBy: filter.status === 'PENDING' ? [{ updatedAt: 'asc' }] : [{ createdAt: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: {
          id: true,
          slug: true,
          name: true,
          ownerName: true,
          status: true,
          logoUrl: true,
          commissionRate: true,
          ratingAvg: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { products: true, orders: true, kycDocuments: true } },
        },
      }),
      this.prisma.shop.count({ where }),
      this.prisma.shop.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const counts = { all: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, SUSPENDED: 0 } as Record<ShopStatus | 'all', number>;
    for (const g of byStatus) {
      counts[g.status] = g._count._all;
      counts.all += g._count._all;
    }
    return {
      items: rows.map((s) => ({
        ...s,
        logoUrl: s.logoUrl ? this.media.publicUrl(s.logoUrl) : null,
        commissionRate: s.commissionRate?.toNumber() ?? null,
        ratingAvg: s.ratingAvg.toNumber(),
      })),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filter.pageSize)),
      counts,
    };
  }

  async detail(id: string) {
    const shop = await this.prisma.shop.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, phone: true, email: true, createdAt: true, isActive: true } },
        kycDocuments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!shop) throw new NotFoundException('Shop not found');
    const [products, orders, revenue, defaultRate] = await Promise.all([
      this.prisma.product.groupBy({ by: ['status'], where: { shopId: id }, _count: { _all: true } }),
      this.prisma.shopOrder.groupBy({ by: ['status'], where: { shopId: id }, _count: { _all: true } }),
      this.prisma.shopOrder.aggregate({ where: { shopId: id, status: 'COMPLETED' }, _sum: { total: true, platformDiscount: true, commissionAmount: true } }),
      this.prisma.setting.findUnique({ where: { key: 'defaultCommissionRate' } }),
    ]);
    return {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      status: shop.status,
      rejectionReason: shop.rejectionReason,
      description: shop.description,
      ownerName: shop.ownerName,
      email: shop.email,
      phone: shop.phone,
      address: shop.address,
      logoUrl: shop.logoUrl ? this.media.publicUrl(shop.logoUrl) : null,
      coverUrl: shop.coverUrl ? this.media.publicUrl(shop.coverUrl) : null,
      commissionRate: shop.commissionRate?.toNumber() ?? null,
      platformCommissionRate: typeof defaultRate?.value === 'number' ? defaultRate.value : 5,
      payment: {
        bankCode: shop.paymentBankCode,
        accountName: shop.paymentAccountName,
        accountNumber: shop.paymentAccountNumber,
        hasQr: shop.paymentQrKey !== null,
      },
      // The shop's own COD choice; the acceptance date is the record that it took on COD risks.
      cod: { enabled: shop.codEnabled, termsAcceptedAt: shop.codTermsAcceptedAt },
      ratingAvg: shop.ratingAvg.toNumber(),
      ratingCount: shop.ratingCount,
      verifiedAt: shop.verifiedAt,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
      owner: shop.owner,
      documents: shop.kycDocuments.map((d) => ({ id: d.id, type: d.type, createdAt: d.createdAt, reviewedAt: d.reviewedAt, ext: d.fileKey.split('.').pop() })),
      productCounts: Object.fromEntries(products.map((p) => [p.status, p._count._all])),
      orderCounts: Object.fromEntries(orders.map((o) => [o.status, o._count._all])),
      // What customers paid plus platform coupons Taladonline pays back.
      completedRevenue: (revenue._sum.total?.toNumber() ?? 0) + (revenue._sum.platformDiscount?.toNumber() ?? 0),
      commissionEarned: revenue._sum.commissionAmount?.toNumber() ?? 0,
    };
  }

  async document(shopId: string, docId: string) {
    const doc = await this.prisma.shopKycDocument.findFirst({ where: { id: docId, shopId } });
    if (!doc) throw new NotFoundException('Document not found');
    return this.storage.get(doc.fileKey);
  }

  async decide(admin: AdminUser, id: string, decision: ShopDecision, reason: string | null, ip?: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');
    const rule = DECISIONS[decision];
    if (!rule.from.includes(shop.status)) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: `A ${shop.status.toLowerCase()} shop can't be ${decision}d` });
    }
    if ((decision === 'reject' || decision === 'suspend') && !reason) {
      throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Give the shop a reason' });
    }
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.shop.update({
        where: { id },
        data: {
          status: rule.to,
          rejectionReason: decision === 'reject' || decision === 'suspend' ? reason : null,
          ...(decision === 'approve' && { verifiedAt: shop.verifiedAt ?? now }),
        },
      });
      if (decision === 'approve' || decision === 'reject') {
        await tx.shopKycDocument.updateMany({ where: { shopId: id, reviewedAt: null }, data: { reviewedAt: now } });
      }
      if (shop.ownerId) {
        const values = { shop: shop.name, reason: reason ?? '' };
        const text = OWNER_TEXT[decision];
        const message = { lo: fill(text.lo, values), en: fill(text.en, values) };
        await this.notifications.send(tx, shop.ownerId, 'SYSTEM', message);
        // The Seller Center too, live: it reloads the shop (e.g. unlocks once approved).
        await this.notifications.toShop(tx, id, 'SHOP_STATUS', message, { link: '/' });
        await this.realtime.emit(tx, `shop:${id}`, { kind: 'shop.status', status: rule.to });
      }
      await this.audit.log(
        { adminId: admin.id, action: `shop.${decision}`, entityType: 'Shop', entityId: id, changes: { from: shop.status, to: rule.to, reason }, ip },
        tx,
      );
    });
    return this.detail(id);
  }

  /** Per-shop commission override; null = platform default (§2.3). */
  async setCommission(admin: AdminUser, id: string, rate: number | null, ip?: string) {
    const shop = await this.prisma.shop.findUnique({ where: { id }, select: { commissionRate: true } });
    if (!shop) throw new NotFoundException('Shop not found');
    await this.prisma.shop.update({ where: { id }, data: { commissionRate: rate } });
    await this.audit.log({
      adminId: admin.id,
      action: 'shop.commission',
      entityType: 'Shop',
      entityId: id,
      changes: { from: shop.commissionRate?.toNumber() ?? null, to: rate },
      ip,
    });
    return this.detail(id);
  }
}

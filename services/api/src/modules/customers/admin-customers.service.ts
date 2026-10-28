import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type AdminUser } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { StorageService } from '../media/storage.service.js';

/** Customer accounts for the admin console (§2.4). */
@Injectable()
export class AdminCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  async list(filter: { q?: string; status?: string; page: number; pageSize: number }) {
    const term = filter.q?.trim();
    const where: Prisma.CustomerWhereInput = {
      ...(filter.status === 'active' && { isActive: true }),
      ...(filter.status === 'suspended' && { isActive: false }),
      ...(filter.status === 'sellers' && { shop: { isNot: null } }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term.replace(/\D/g, '') || term } },
        ],
      }),
    };
    const [rows, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          isActive: true,
          pointsBalance: true,
          createdAt: true,
          shop: { select: { id: true, name: true, status: true } },
          _count: { select: { orders: true } },
        },
      }),
      this.prisma.customer.count({ where }),
    ]);
    // Spend per customer (non-cancelled shop orders), one query for the page.
    const spend = rows.length
      ? await this.prisma.$queryRaw<{ id: string; spent: Prisma.Decimal | null }[]>`
          SELECT o."customerId" AS id, SUM(so.total) AS spent
          FROM "ShopOrder" so JOIN "Order" o ON o.id = so."orderId"
          WHERE o."customerId" IN (${Prisma.join(rows.map((r) => r.id))}) AND so.status <> 'CANCELLED'
          GROUP BY 1`
      : [];
    const spent = new Map(spend.map((s) => [s.id, s.spent ? Number(s.spent) : 0]));
    return {
      items: rows.map(({ _count, ...c }) => ({ ...c, orderCount: _count.orders, totalSpent: spent.get(c.id) ?? 0 })),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filter.pageSize)),
    };
  }

  async detail(id: string) {
    const c = await this.prisma.customer.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        isActive: true,
        locale: true,
        pointsBalance: true,
        phoneVerifiedAt: true,
        googleId: true,
        appleId: true,
        createdAt: true,
        shop: { select: { id: true, name: true, slug: true, status: true } },
        _count: { select: { orders: true, addresses: true, reviews: true } },
        points: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, type: true, points: true, note: true, expiresAt: true, createdAt: true } },
        // Where refunds are sent (the customer's saved accounts, default first).
        bankAccounts: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, bankCode: true, accountName: true, accountNumber: true, isDefault: true, qrImageKey: true },
        },
      },
    });
    if (!c) throw new NotFoundException('Customer not found');
    const [spent, sessions, disputes] = await Promise.all([
      this.prisma.shopOrder.aggregate({ where: { order: { customerId: id }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      this.prisma.session.count({ where: { actorType: 'CUSTOMER', actorId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.dispute.count({ where: { shopOrder: { order: { customerId: id } } } }),
    ]);
    const { googleId, appleId, _count, bankAccounts, ...rest } = c;
    return {
      ...rest,
      bankAccounts: bankAccounts.map(({ qrImageKey, ...a }) => ({ ...a, hasQr: qrImageKey !== null })),
      linked: { google: googleId !== null, apple: appleId !== null },
      orderCount: _count.orders,
      addressCount: _count.addresses,
      reviewCount: _count.reviews,
      totalSpent: spent._sum.total?.toNumber() ?? 0,
      activeSessions: sessions,
      disputeCount: disputes,
    };
  }

  /** The QR of one of the customer's refund accounts (private). */
  async bankAccountQr(customerId: string, accountId: string) {
    const a = await this.prisma.customerBankAccount.findFirst({ where: { id: accountId, customerId }, select: { qrImageKey: true } });
    if (!a?.qrImageKey) throw new NotFoundException('No QR');
    return this.storage.get(a.qrImageKey);
  }

  /** Suspending signs the customer out everywhere; their shop stays as it is. */
  async setActive(admin: AdminUser, id: string, isActive: boolean, reason: string | null, ip?: string) {
    const c = await this.prisma.customer.findUnique({ where: { id }, select: { isActive: true } });
    if (!c) throw new NotFoundException('Customer not found');
    if (!isActive && !reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Say why the account is suspended' });
    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({ where: { id }, data: { isActive } });
      if (!isActive) {
        await tx.session.updateMany({ where: { actorType: 'CUSTOMER', actorId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.log(
        { adminId: admin.id, action: isActive ? 'customer.reactivate' : 'customer.suspend', entityType: 'Customer', entityId: id, changes: { reason }, ip },
        tx,
      );
    });
    return this.detail(id);
  }
}

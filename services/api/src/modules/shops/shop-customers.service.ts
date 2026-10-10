import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ShopCustomer {
  id: string;
  name: string;
  phone: string | null;
  orderCount: number;
  /** Excludes cancelled orders. */
  totalSpent: number;
  lastOrderAt: Date;
  note: string | null;
  blacklisted: boolean;
}

export interface ShopCustomerList {
  items: ShopCustomer[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** People who bought from the shop, with private notes and a blacklist (§3.5). */
@Injectable()
export class ShopCustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(shopId: string, q: string | undefined, blacklisted: boolean, page: number, pageSize: number): Promise<ShopCustomerList> {
    const term = q?.trim();
    const pattern = term ? `%${term.replace(/[\\%_]/g, '\\$&')}%` : null;
    const digits = term?.replace(/\D/g, '');
    const filters = Prisma.sql`
      ${pattern ? Prisma.sql`AND (c.name ILIKE ${pattern} ${digits ? Prisma.sql`OR c.phone LIKE ${`%${digits}%`}` : Prisma.empty})` : Prisma.empty}
      ${blacklisted ? Prisma.sql`AND n.blacklisted = true` : Prisma.empty}`;
    const base = Prisma.sql`
      FROM "ShopOrder" so
      JOIN "Order" o ON o.id = so."orderId"
      JOIN "Customer" c ON c.id = o."customerId"
      LEFT JOIN "ShopCustomerNote" n ON n."shopId" = so."shopId" AND n."customerId" = c.id
      WHERE so."shopId" = ${shopId} ${filters}`;

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<
        { id: string; name: string; phone: string | null; orders: number; spent: Prisma.Decimal | null; last: Date; note: string | null; blacklisted: boolean | null }[]
      >`
        SELECT c.id, c.name, c.phone,
               COUNT(so.id)::int AS orders,
               SUM(so.total) FILTER (WHERE so.status <> 'CANCELLED') AS spent,
               MAX(so."createdAt") AS last,
               MAX(n.note) AS note,
               BOOL_OR(n.blacklisted) AS blacklisted
        ${base}
        GROUP BY c.id
        ORDER BY last DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(DISTINCT c.id)::int AS total ${base}`,
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        orderCount: r.orders,
        totalSpent: r.spent ? Number(r.spent) : 0,
        lastOrderAt: r.last,
        note: r.note,
        blacklisted: r.blacklisted ?? false,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** The customer's orders with this shop, newest first. */
  async orders(shopId: string, customerId: string) {
    await this.assertBuyer(shopId, customerId);
    const rows = await this.prisma.shopOrder.findMany({
      where: { shopId, order: { customerId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { number: true, status: true, total: true, createdAt: true },
    });
    return rows.map((r) => ({ ...r, total: r.total.toNumber() }));
  }

  async updateNote(shopId: string, customerId: string, note: string | null, blacklisted: boolean) {
    await this.assertBuyer(shopId, customerId);
    const saved = await this.prisma.shopCustomerNote.upsert({
      where: { shopId_customerId: { shopId, customerId } },
      create: { shopId, customerId, note, blacklisted },
      update: { note, blacklisted },
    });
    return { note: saved.note, blacklisted: saved.blacklisted };
  }

  /** Shops only see (and note) people who ordered from them. */
  private async assertBuyer(shopId: string, customerId: string) {
    const ordered = await this.prisma.shopOrder.findFirst({ where: { shopId, order: { customerId } }, select: { id: true } });
    if (!ordered) throw new NotFoundException('Customer not found');
  }
}

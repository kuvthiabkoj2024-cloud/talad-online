import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AuditEntry {
  adminId: string;
  /** e.g. "shop.approve" */
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  ip?: string;
}

/** Who changed what, when (§2.1). Written inside the change's transaction when one is given. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry, db: Pick<Prisma.TransactionClient, 'auditLog'> = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        adminId: entry.adminId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        changes: (entry.changes ?? undefined) as Prisma.InputJsonValue | undefined,
        ipAddress: entry.ip,
      },
    });
  }

  async list(filter: { entityType?: string; entityId?: string; adminId?: string; page: number; pageSize: number }) {
    const where: Prisma.AuditLogWhereInput = {
      ...(filter.entityType && { entityType: filter.entityType }),
      ...(filter.entityId && { entityId: filter.entityId }),
      ...(filter.adminId && { adminId: filter.adminId }),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        include: { admin: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, page: filter.page, pageSize: filter.pageSize, total, totalPages: Math.max(1, Math.ceil(total / filter.pageSize)) };
  }
}

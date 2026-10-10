import { Body, Controller, Get, Injectable, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength, ValidateNested } from 'class-validator';
import { randomUUID } from 'node:crypto';
import type { AdminUser, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminAuthGuard, CurrentAdmin, Roles } from '../auth/admin-auth.guard.js';

class MessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  title: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 1000)
  body: string;
}

export class AnnouncementDto {
  /** Every active customer, or the owners of approved shops. */
  @IsIn(['customers', 'sellers'])
  audience: 'customers' | 'sellers';

  @IsIn(['PROMOTION', 'SYSTEM'])
  type: 'PROMOTION' | 'SYSTEM';

  @ValidateNested()
  @Type(() => MessageDto)
  lo: MessageDto;

  @ValidateNested()
  @Type(() => MessageDto)
  en: MessageDto;

  /** Storefront path to open, e.g. `/feed`. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/[^\s]*$/)
  link?: string;
}

const BATCH = 1000;

/** Broadcast announcements to all customers or all sellers (§2.11), as in-app notifications. */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async send(admin: AdminUser, dto: AnnouncementDto): Promise<{ id: string; recipients: number }> {
    const where: Prisma.CustomerWhereInput =
      dto.audience === 'sellers' ? { isActive: true, shop: { status: 'APPROVED' } } : { isActive: true };
    const data = { link: dto.link, i18n: { lo: dto.lo, en: dto.en } } as object;
    let recipients = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.customer.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH,
        ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      });
      if (!batch.length) break;
      await this.prisma.notification.createMany({
        data: batch.map((c) => ({ customerId: c.id, type: dto.type, title: dto.en.title, body: dto.en.body, data })),
      });
      recipients += batch.length;
      cursor = batch[batch.length - 1].id;
    }
    const id = randomUUID();
    await this.audit.log({
      adminId: admin.id,
      action: 'announcement.send',
      entityType: 'Announcement',
      entityId: id,
      changes: { audience: dto.audience, type: dto.type, title: dto.en.title, titleLo: dto.lo.title, link: dto.link, recipients },
    });
    return { id, recipients };
  }

  /** Past announcements (kept in the audit log). */
  async history() {
    const rows = await this.prisma.auditLog.findMany({
      where: { action: 'announcement.send' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { admin: { select: { name: true } } },
    });
    return rows.map((r) => ({ id: r.entityId, ...(r.changes as object), sentAt: r.createdAt, by: r.admin?.name ?? null }));
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  history() {
    return this.announcements.history();
  }

  @Post()
  send(@CurrentAdmin() a: AdminUser, @Body() dto: AnnouncementDto) {
    return this.announcements.send(a, dto);
  }
}

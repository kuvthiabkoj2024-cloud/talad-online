import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUser, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { MediaService } from '../media/media.service.js';
import type { BannerDto } from './banner.dto.js';

/** Landing-page banners (§2.8): image, link and schedule. */
@Injectable()
export class BannersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  /** What the storefront shows right now, in order. */
  async active() {
    const now = new Date();
    const rows = await this.prisma.banner.findMany({
      where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 10,
    });
    return rows.map((b) => ({ id: b.id, title: b.title, imageUrl: this.media.publicUrl(b.imageUrl), linkTarget: b.linkTarget }));
  }

  async list() {
    const now = new Date();
    const rows = await this.prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
    return rows.map((b) => ({
      ...b,
      imageUrl: this.media.publicUrl(b.imageUrl),
      live: b.isActive && b.startsAt <= now && b.endsAt > now,
    }));
  }

  async save(admin: AdminUser, id: string | null, dto: BannerDto) {
    if (dto.endsAt <= dto.startsAt) throw new BadRequestException({ code: 'INVALID_DATES', message: 'The end must be after the start' });
    const data = {
      title: { lo: dto.title.lo, ...(dto.title.en && { en: dto.title.en }) } as Prisma.InputJsonObject,
      imageUrl: dto.imageUrl,
      linkTarget: dto.linkTarget || null,
      sortOrder: dto.sortOrder,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      isActive: dto.isActive,
    };
    const saved = id ? await this.prisma.banner.update({ where: { id }, data }) : await this.prisma.banner.create({ data });
    await this.audit.log({ adminId: admin.id, action: id ? 'banner.update' : 'banner.create', entityType: 'Banner', entityId: saved.id, changes: { ...data } });
    return saved;
  }

  async remove(admin: AdminUser, id: string) {
    const { count } = await this.prisma.banner.deleteMany({ where: { id } });
    if (!count) throw new NotFoundException('Banner not found');
    await this.audit.log({ adminId: admin.id, action: 'banner.delete', entityType: 'Banner', entityId: id });
  }
}

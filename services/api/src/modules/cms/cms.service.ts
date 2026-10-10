import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CHECKOUT_PAYMENT_METHODS } from '@talad/shared';
import type { AdminUser, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { CmsPageDto, PlatformSettingsDto } from './cms.dto.js';

export const CMS_SLUGS = ['about', 'terms', 'privacy', 'faq'] as const;
type PageText = { title: string; body: string };

/** Settings the admin console edits; everything else is shown read-only. */
export interface PlatformSettings {
  productModeration: 'pre' | 'post';
  defaultCommissionRate: number;
  paymentMethods: string[];
  points: { earnPer: number; redeemValue: number; expiryDays: number };
  readOnly: { currency: string; timezone: string; locales: string[]; taxRate: number };
}

const DEFAULTS: Omit<PlatformSettings, 'readOnly'> = {
  productModeration: 'pre',
  defaultCommissionRate: 5,
  paymentMethods: [...CHECKOUT_PAYMENT_METHODS],
  points: { earnPer: 10_000, redeemValue: 100, expiryDays: 365 },
};

/** Legal/help pages, platform settings (§2.11). */
@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async pages() {
    const rows = await this.prisma.cmsPage.findMany({ orderBy: { slug: 'asc' } });
    return rows.map((p) => ({ slug: p.slug, content: p.content as Record<string, PageText>, updatedAt: p.updatedAt }));
  }

  async page(slug: string) {
    const p = await this.prisma.cmsPage.findUnique({ where: { slug } });
    if (!p) throw new NotFoundException('Page not found');
    return { slug: p.slug, content: p.content as Record<string, PageText>, updatedAt: p.updatedAt };
  }

  async savePage(admin: AdminUser, slug: string, dto: CmsPageDto) {
    if (!(CMS_SLUGS as readonly string[]).includes(slug)) throw new NotFoundException('Page not found');
    const content = { lo: dto.lo, ...(dto.en && { en: dto.en }) } as unknown as Prisma.InputJsonObject;
    const saved = await this.prisma.cmsPage.upsert({ where: { slug }, create: { slug, content }, update: { content } });
    await this.audit.log({ adminId: admin.id, action: 'cms.update', entityType: 'CmsPage', entityId: saved.id, changes: { slug } });
    return this.page(slug);
  }

  async settings(): Promise<PlatformSettings> {
    const rows = await this.prisma.setting.findMany();
    const v = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, unknown>;
    return {
      productModeration: v.productModeration === 'post' ? 'post' : 'pre',
      defaultCommissionRate: typeof v.defaultCommissionRate === 'number' ? v.defaultCommissionRate : DEFAULTS.defaultCommissionRate,
      paymentMethods: Array.isArray(v.paymentMethods) ? (v.paymentMethods as string[]) : DEFAULTS.paymentMethods,
      points: { ...DEFAULTS.points, ...(v.points as Partial<PlatformSettings['points']> | undefined) },
      readOnly: {
        currency: (v.currency as string) ?? 'LAK',
        timezone: (v.timezone as string) ?? 'Asia/Vientiane',
        locales: (v.locales as string[]) ?? ['lo', 'en'],
        taxRate: (v.taxRate as number) ?? 0,
      },
    };
  }

  /** What storefront checkout needs. */
  async publicSettings() {
    const s = await this.settings();
    return { paymentMethods: s.paymentMethods };
  }

  async saveSettings(admin: AdminUser, dto: PlatformSettingsDto): Promise<PlatformSettings> {
    if (dto.paymentMethods.length === 0) {
      throw new BadRequestException({ code: 'NO_PAYMENT_METHOD', message: 'Keep at least one payment method' });
    }
    const before = await this.settings();
    const values: Record<string, Prisma.InputJsonValue> = {
      productModeration: dto.productModeration,
      defaultCommissionRate: dto.defaultCommissionRate,
      paymentMethods: [...new Set(dto.paymentMethods)],
      points: { earnPer: dto.points.earnPer, redeemValue: dto.points.redeemValue, expiryDays: dto.points.expiryDays },
    };
    await this.prisma.$transaction(
      Object.entries(values).map(([key, value]) => this.prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } })),
    );
    const { readOnly: _, ...previous } = before;
    await this.audit.log({ adminId: admin.id, action: 'settings.update', entityType: 'Setting', entityId: 'platform', changes: { before: previous, after: values } });
    return this.settings();
  }
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProductStatus } from '@talad/shared';
import type { AdminUser, Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { MediaService } from '../../media/media.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';

export type ProductDecision = 'approve' | 'reject' | 'unpublish';

const RULES: Record<ProductDecision, { from: ProductStatus[]; to: ProductStatus }> = {
  approve: { from: ['PENDING', 'REJECTED'], to: 'PUBLISHED' },
  reject: { from: ['PENDING'], to: 'REJECTED' },
  // Taking down a live listing that breaks the content policy (§2.5).
  unpublish: { from: ['PUBLISHED'], to: 'REJECTED' },
};

/** Product oversight and pre-moderation for the admin console (§2.5). */
@Injectable()
export class AdminProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(filter: { status?: ProductStatus; q?: string; shopId?: string; page: number; pageSize: number }) {
    const term = filter.q?.trim();
    const where: Prisma.ProductWhereInput = {
      ...(filter.status && { status: filter.status }),
      ...(filter.shopId && { shopId: filter.shopId }),
      ...(term && {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { sku: { contains: term, mode: 'insensitive' } },
          { shop: { name: { contains: term, mode: 'insensitive' } } },
        ],
      }),
    };
    const [rows, total, byStatus] = await Promise.all([
      this.prisma.product.findMany({
        where,
        // The review queue is first come, first served.
        orderBy: filter.status === 'PENDING' ? [{ updatedAt: 'asc' }] : [{ updatedAt: 'desc' }],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: {
          id: true,
          name: true,
          sku: true,
          slug: true,
          status: true,
          price: true,
          stock: true,
          videoKey: true,
          rejectionReason: true,
          updatedAt: true,
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } },
          shop: { select: { id: true, name: true, slug: true, status: true } },
          category: { select: { name: true } },
        },
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.groupBy({ by: ['status'], where: filter.shopId ? { shopId: filter.shopId } : {}, _count: { _all: true } }),
    ]);
    const counts = { all: 0, DRAFT: 0, PENDING: 0, PUBLISHED: 0, REJECTED: 0 } as Record<ProductStatus | 'all', number>;
    for (const g of byStatus) {
      counts[g.status] = g._count._all;
      counts.all += g._count._all;
    }
    return {
      items: rows.map(({ images, videoKey, price, ...p }) => ({
        ...p,
        price: price.toNumber(),
        hasVideo: videoKey !== null,
        imageUrl: images[0] ? this.media.publicUrl(images[0].key) : null,
      })),
      page: filter.page,
      pageSize: filter.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filter.pageSize)),
      counts,
    };
  }

  async detail(id: string) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { orderBy: { sku: 'asc' } },
        category: { select: { name: true, parent: { select: { name: true } } } },
        unit: { select: { code: true, name: true } },
        shop: { select: { id: true, name: true, slug: true, status: true } },
      },
    });
    if (!p) throw new NotFoundException('Product not found');
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      description: p.description,
      status: p.status,
      rejectionReason: p.rejectionReason,
      price: p.price.toNumber(),
      compareAtPrice: p.compareAtPrice?.toNumber() ?? null,
      stock: p.variants.length ? p.variants.reduce((s, v) => s + v.stock, 0) : p.stock,
      soldCount: p.soldCount,
      viewCount: p.viewCount,
      imageUrls: p.images.map((i) => this.media.publicUrl(i.key)),
      videoUrl: p.videoKey ? this.media.publicUrl(p.videoKey) : null,
      variants: p.variants.map((v) => ({
        sku: v.sku,
        label: Object.values(v.attributes as Record<string, string>).join(' / '),
        price: v.price?.toNumber() ?? null,
        stock: v.stock,
      })),
      category: p.category,
      unit: p.unit,
      shop: p.shop,
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async decide(admin: AdminUser, id: string, decision: ProductDecision, reason: string | null, ip?: string) {
    const p = await this.prisma.product.findUnique({ where: { id }, include: { shop: { select: { ownerId: true, name: true } } } });
    if (!p) throw new NotFoundException('Product not found');
    const rule = RULES[decision];
    if (!rule.from.includes(p.status)) {
      throw new ConflictException({ code: 'INVALID_TRANSITION', message: `A ${p.status.toLowerCase()} product can't be ${decision}d` });
    }
    if (decision !== 'approve' && !reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Give the shop a reason' });

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          status: rule.to,
          rejectionReason: decision === 'approve' ? null : reason,
          ...(decision === 'approve' && !p.publishedAt && { publishedAt: new Date() }),
        },
      });
      if (p.shop.ownerId) {
        const approved = decision === 'approve';
        await this.notifications.send(
          tx,
          p.shop.ownerId,
          'SYSTEM',
          approved
            ? {
                lo: { title: 'ສິນຄ້າໄດ້ຮັບການອະນຸມັດ', body: `“${p.name}” ເລີ່ມຂາຍແລ້ວ.` },
                en: { title: 'Product approved', body: `“${p.name}” is now on sale.` },
              }
            : {
                lo: { title: decision === 'unpublish' ? 'ສິນຄ້າຖືກຢຸດຂາຍ' : 'ສິນຄ້າບໍ່ໄດ້ຮັບການອະນຸມັດ', body: `“${p.name}”: ${reason}` },
                en: { title: decision === 'unpublish' ? 'Product taken off sale' : 'Product not approved', body: `“${p.name}”: ${reason}` },
              },
        );
      }
      await this.audit.log(
        { adminId: admin.id, action: `product.${decision}`, entityType: 'Product', entityId: id, changes: { from: p.status, to: rule.to, reason }, ip },
        tx,
      );
    });
    return this.detail(id);
  }
}

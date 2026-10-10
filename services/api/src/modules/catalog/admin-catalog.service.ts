import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUser, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { AdminCategoryDto, AdminUnitDto } from './admin-catalog.dto.js';

/** A DTO as a plain JSON object for the audit log. */
const plain = (dto: object): Record<string, unknown> => JSON.parse(JSON.stringify(dto)) as Record<string, unknown>;

const localizedName = (n: { lo: string; en?: string }): Prisma.InputJsonObject => ({ lo: n.lo, ...(n.en && { en: n.en }) });

/** Category tree and units (§2.6). Deleting is refused while anything still uses them. */
@Injectable()
export class AdminCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async categories() {
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      include: { _count: { select: { products: true, children: true } } },
    });
    return rows.map(({ _count, commissionRate, ...c }) => ({
      ...c,
      commissionRate: commissionRate?.toNumber() ?? null,
      productCount: _count.products,
      childCount: _count.children,
    }));
  }

  async saveCategory(admin: AdminUser, id: string | null, dto: AdminCategoryDto) {
    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId }, select: { parentId: true } });
      // Two levels: Category → Subcategory.
      if (!parent || parent.parentId) throw new ConflictException({ code: 'INVALID_PARENT', message: 'Choose a top-level category' });
      if (id && dto.parentId === id) throw new ConflictException({ code: 'INVALID_PARENT', message: 'A category cannot contain itself' });
      if (id && (await this.prisma.category.count({ where: { parentId: id } }))) {
        throw new ConflictException({ code: 'HAS_CHILDREN', message: 'Move its subcategories first' });
      }
    }
    const clash = await this.prisma.category.findFirst({ where: { slug: dto.slug, ...(id && { NOT: { id } }) }, select: { id: true } });
    if (clash) throw new ConflictException({ code: 'SLUG_TAKEN', message: 'Another category uses this slug' });

    const data = {
      slug: dto.slug,
      name: localizedName(dto.name),
      parentId: dto.parentId ?? null,
      iconUrl: dto.iconUrl || null,
      imageUrl: dto.imageUrl || null,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
      commissionRate: dto.commissionRate ?? null,
    };
    const saved = id
      ? await this.prisma.category.update({ where: { id }, data })
      : await this.prisma.category.create({ data });
    await this.audit.log({ adminId: admin.id, action: id ? 'category.update' : 'category.create', entityType: 'Category', entityId: saved.id, changes: plain(dto) });
    return saved;
  }

  async deleteCategory(admin: AdminUser, id: string) {
    const c = await this.prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true, children: true } } } });
    if (!c) throw new NotFoundException('Category not found');
    if (c._count.products || c._count.children) {
      throw new ConflictException({ code: 'IN_USE', message: 'Products or subcategories still use it; hide it instead' });
    }
    await this.prisma.category.delete({ where: { id } });
    await this.audit.log({ adminId: admin.id, action: 'category.delete', entityType: 'Category', entityId: id, changes: { slug: c.slug } });
  }

  async units() {
    const rows = await this.prisma.unit.findMany({ orderBy: { code: 'asc' }, include: { _count: { select: { products: true } } } });
    return rows.map(({ _count, ...u }) => ({ ...u, productCount: _count.products }));
  }

  async saveUnit(admin: AdminUser, id: string | null, dto: AdminUnitDto) {
    const clash = await this.prisma.unit.findFirst({ where: { code: dto.code, ...(id && { NOT: { id } }) }, select: { id: true } });
    if (clash) throw new ConflictException({ code: 'CODE_TAKEN', message: 'Another unit uses this code' });
    const data = { code: dto.code, name: localizedName(dto.name) };
    const saved = id ? await this.prisma.unit.update({ where: { id }, data }) : await this.prisma.unit.create({ data });
    await this.audit.log({ adminId: admin.id, action: id ? 'unit.update' : 'unit.create', entityType: 'Unit', entityId: saved.id, changes: plain(dto) });
    return saved;
  }

  async deleteUnit(admin: AdminUser, id: string) {
    const u = await this.prisma.unit.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
    if (!u) throw new NotFoundException('Unit not found');
    if (u._count.products) throw new ConflictException({ code: 'IN_USE', message: 'Products still use this unit' });
    await this.prisma.unit.delete({ where: { id } });
    await this.audit.log({ adminId: admin.id, action: 'unit.delete', entityType: 'Unit', entityId: id, changes: { code: u.code } });
  }
}

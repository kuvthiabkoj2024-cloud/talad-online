import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AdminUser } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import type { DeliveryProviderDto, ShippingZoneDto } from './admin-delivery.dto.js';

/**
 * Couriers and their shipping zones (§2.7). Checkout offers a courier only where one of
 * its zones covers the buyer's province (a zone with no provinces covers the whole country).
 */
@Injectable()
export class AdminDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const rows = await this.prisma.deliveryProvider.findMany({
      orderBy: { createdAt: 'asc' },
      // API credentials never leave the server.
      omit: { credentials: true },
      include: { zones: { orderBy: { name: 'asc' } }, _count: { select: { orders: true } } },
    });
    return rows.map(({ _count, zones, ...p }) => ({
      ...p,
      orderCount: _count.orders,
      zones: zones.map((z) => ({ ...z, baseFee: z.baseFee.toNumber(), perKgFee: z.perKgFee.toNumber() })),
    }));
  }

  async saveProvider(admin: AdminUser, id: string | null, dto: DeliveryProviderDto) {
    const clash = await this.prisma.deliveryProvider.findFirst({ where: { code: dto.code, ...(id && { NOT: { id } }) }, select: { id: true } });
    if (clash) throw new ConflictException({ code: 'CODE_TAKEN', message: 'Another courier uses this code' });
    const data = { code: dto.code, name: dto.name, logoUrl: dto.logoUrl || null, mode: dto.mode, isActive: dto.isActive };
    const saved = id
      ? await this.prisma.deliveryProvider.update({ where: { id }, data })
      : await this.prisma.deliveryProvider.create({ data });
    await this.audit.log({ adminId: admin.id, action: id ? 'delivery.update' : 'delivery.create', entityType: 'DeliveryProvider', entityId: saved.id, changes: data });
    return saved;
  }

  async deleteProvider(admin: AdminUser, id: string) {
    const p = await this.prisma.deliveryProvider.findUnique({ where: { id }, include: { _count: { select: { orders: true } } } });
    if (!p) throw new NotFoundException('Courier not found');
    if (p._count.orders) throw new ConflictException({ code: 'IN_USE', message: 'Orders used this courier; turn it off instead' });
    await this.prisma.deliveryProvider.delete({ where: { id } });
    await this.audit.log({ adminId: admin.id, action: 'delivery.delete', entityType: 'DeliveryProvider', entityId: id, changes: { code: p.code } });
  }

  async saveZone(admin: AdminUser, providerId: string, zoneId: string | null, dto: ShippingZoneDto) {
    if (!(await this.prisma.deliveryProvider.findUnique({ where: { id: providerId }, select: { id: true } }))) {
      throw new NotFoundException('Courier not found');
    }
    const data = { name: dto.name, provinces: [...new Set(dto.provinces)], baseFee: dto.baseFee, perKgFee: dto.perKgFee };
    const saved = zoneId
      ? await this.prisma.shippingZone.update({ where: { id: zoneId, deliveryProviderId: providerId }, data })
      : await this.prisma.shippingZone.create({ data: { ...data, deliveryProviderId: providerId } });
    await this.audit.log({ adminId: admin.id, action: zoneId ? 'zone.update' : 'zone.create', entityType: 'ShippingZone', entityId: saved.id, changes: data });
    return { ...saved, baseFee: saved.baseFee.toNumber(), perKgFee: saved.perKgFee.toNumber() };
  }

  async deleteZone(admin: AdminUser, providerId: string, zoneId: string) {
    const { count } = await this.prisma.shippingZone.deleteMany({ where: { id: zoneId, deliveryProviderId: providerId } });
    if (!count) throw new NotFoundException('Zone not found');
    await this.audit.log({ adminId: admin.id, action: 'zone.delete', entityType: 'ShippingZone', entityId: zoneId });
  }
}

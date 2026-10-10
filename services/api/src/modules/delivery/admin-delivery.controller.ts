import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AdminUser } from '../../generated/prisma/client.js';
import { AdminAuthGuard, CurrentAdmin, Roles } from '../auth/admin-auth.guard.js';
import { DeliveryProviderDto, ShippingZoneDto } from './admin-delivery.dto.js';
import { AdminDeliveryService } from './admin-delivery.service.js';

const id = new ParseUUIDPipe({ version: '7' });

/** Couriers and shipping zones (§2.7). Super Admin only. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPER_ADMIN')
@Controller('admin/delivery')
export class AdminDeliveryController {
  constructor(private readonly delivery: AdminDeliveryService) {}

  @Get()
  list() {
    return this.delivery.list();
  }

  @Post()
  create(@CurrentAdmin() a: AdminUser, @Body() dto: DeliveryProviderDto) {
    return this.delivery.saveProvider(a, null, dto);
  }

  @Put(':id')
  update(@CurrentAdmin() a: AdminUser, @Param('id', id) providerId: string, @Body() dto: DeliveryProviderDto) {
    return this.delivery.saveProvider(a, providerId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentAdmin() a: AdminUser, @Param('id', id) providerId: string) {
    return this.delivery.deleteProvider(a, providerId);
  }

  @Post(':id/zones')
  createZone(@CurrentAdmin() a: AdminUser, @Param('id', id) providerId: string, @Body() dto: ShippingZoneDto) {
    return this.delivery.saveZone(a, providerId, null, dto);
  }

  @Put(':id/zones/:zoneId')
  updateZone(@CurrentAdmin() a: AdminUser, @Param('id', id) providerId: string, @Param('zoneId', id) zoneId: string, @Body() dto: ShippingZoneDto) {
    return this.delivery.saveZone(a, providerId, zoneId, dto);
  }

  @Delete(':id/zones/:zoneId')
  @HttpCode(204)
  removeZone(@CurrentAdmin() a: AdminUser, @Param('id', id) providerId: string, @Param('zoneId', id) zoneId: string) {
    return this.delivery.deleteZone(a, providerId, zoneId);
  }
}

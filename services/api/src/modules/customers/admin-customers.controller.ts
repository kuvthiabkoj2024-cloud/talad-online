import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AdminUser } from '../../generated/prisma/client.js';
import { AdminPageQuery, ReasonDto } from '../admins/admin.dto.js';
import { AdminAuthGuard, ClientIp, CurrentAdmin, Permission } from '../auth/admin-auth.guard.js';
import { AdminCustomersService } from './admin-customers.service.js';

const id = new ParseUUIDPipe({ version: '7' });

/** Customer accounts (§2.4). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('customers')
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  /** `?status=active|suspended|sellers&q=&page=` */
  @Get()
  list(@Query() q: AdminPageQuery) {
    return this.customers.list(q);
  }

  @Get(':id')
  detail(@Param('id', id) customerId: string) {
    return this.customers.detail(customerId);
  }

  @Post(':id/suspend')
  suspend(@CurrentAdmin() a: AdminUser, @Param('id', id) customerId: string, @Body() dto: ReasonDto, @ClientIp() ip: string) {
    return this.customers.setActive(a, customerId, false, dto.reason ?? null, ip);
  }

  @Post(':id/reactivate')
  reactivate(@CurrentAdmin() a: AdminUser, @Param('id', id) customerId: string, @Body() dto: ReasonDto, @ClientIp() ip: string) {
    return this.customers.setActive(a, customerId, true, dto.reason ?? null, ip);
  }
}

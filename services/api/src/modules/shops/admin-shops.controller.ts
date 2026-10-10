import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SHOP_STATUSES, type ShopStatus } from '@talad/shared';
import type { AdminUser } from '../../generated/prisma/client.js';
import { AdminPageQuery, RateDto, ReasonDto } from '../admins/admin.dto.js';
import { AdminAuthGuard, ClientIp, CurrentAdmin, Roles } from '../auth/admin-auth.guard.js';
import { AdminShopsService, type ShopDecision } from './admin-shops.service.js';

const id = new ParseUUIDPipe({ version: '7' });
const DECISIONS: ShopDecision[] = ['approve', 'reject', 'suspend', 'reinstate'];

/** Admin shop management (§2.3): review applications and KYC, approve, suspend, commission. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPPORT', 'FINANCE')
@Controller('admin/shops')
export class AdminShopsController {
  constructor(private readonly shops: AdminShopsService) {}

  /** `?status=PENDING|APPROVED|REJECTED|SUSPENDED&q=&page=` */
  @Get()
  list(@Query() q: AdminPageQuery) {
    const status = (SHOP_STATUSES as readonly string[]).includes(q.status ?? '') ? (q.status as ShopStatus) : undefined;
    return this.shops.list({ status, q: q.q, page: q.page, pageSize: q.pageSize });
  }

  @Get(':id')
  detail(@Param('id', id) shopId: string) {
    return this.shops.detail(shopId);
  }

  /** A KYC document (private), for review. */
  @Get(':id/documents/:docId')
  async document(@Param('id', id) shopId: string, @Param('docId', id) docId: string) {
    const file = await this.shops.document(shopId, docId);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  /** approve | reject | suspend | reinstate (reason required to reject or suspend). */
  @Post(':id/:decision')
  @Roles('SUPPORT')
  decide(
    @CurrentAdmin() admin: AdminUser,
    @Param('id', id) shopId: string,
    @Param('decision') decision: string,
    @Body() dto: ReasonDto,
    @ClientIp() ip: string,
  ) {
    if (!DECISIONS.includes(decision as ShopDecision)) throw new BadRequestException('Unknown decision');
    return this.shops.decide(admin, shopId, decision as ShopDecision, dto.reason ?? null, ip);
  }

  @Put(':id/commission')
  @Roles('FINANCE')
  commission(@CurrentAdmin() admin: AdminUser, @Param('id', id) shopId: string, @Body() dto: RateDto, @ClientIp() ip: string) {
    return this.shops.setCommission(admin, shopId, dto.rate, ip);
  }
}

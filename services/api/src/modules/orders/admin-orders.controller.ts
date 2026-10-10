import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { isShopOrderTab } from '@talad/shared';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AdminUser, DisputeStatus, PayoutStatus } from '../../generated/prisma/client.js';
import { AdminPageQuery, ReasonDto } from '../admins/admin.dto.js';
import { AdminAuthGuard, ClientIp, CurrentAdmin, Roles } from '../auth/admin-auth.guard.js';
import { AdminOrdersService, type DisputeDecision, type PayoutAction } from './admin-orders.service.js';
import { ShopOrdersService } from './shop-orders.service.js';

class AdminOrdersQuery extends AdminPageQuery {
  @IsOptional()
  @IsUUID('7')
  shopId?: string;

  @IsOptional()
  @IsUUID('7')
  customerId?: string;
}

class ReferenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

const id = new ParseUUIDPipe({ version: '7' });
const DISPUTE_STATUSES: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_REJECTED'];
const PAYOUT_STATUSES: PayoutStatus[] = ['SCHEDULED', 'PROCESSING', 'PAID', 'FAILED'];

/** Platform-wide orders, read-only for support (§3.6). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPPORT', 'FINANCE')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: ShopOrdersService) {}

  /** `?status=<shop order tab>&q=&shopId=&customerId=&page=` */
  @Get()
  list(@Query() q: AdminOrdersQuery) {
    return this.orders.list(null, { tab: isShopOrderTab(q.status) ? q.status : undefined, q: q.q, page: q.page, pageSize: q.pageSize }, q.customerId);
  }

  @Get(':number')
  async detail(@Param('number') number: string) {
    const { actions: _, ...order } = await this.orders.detail(null, number);
    return order;
  }

  @Get(':number/slip')
  async slip(@Param('number') number: string) {
    const file = await this.orders.slip(null, number);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }
}

/** Escalated returns and refund requests (§2.10). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPPORT')
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly admin: AdminOrdersService) {}

  @Get()
  list(@Query() q: AdminPageQuery) {
    const status = DISPUTE_STATUSES.includes(q.status as DisputeStatus) ? (q.status as DisputeStatus) : undefined;
    return this.admin.disputes({ status, page: q.page, pageSize: q.pageSize });
  }

  /** review | refund | reject (`reason` = the resolution shown to both sides). */
  @Post(':id/:decision')
  decide(@CurrentAdmin() a: AdminUser, @Param('id', id) disputeId: string, @Param('decision') decision: string, @Body() dto: ReasonDto, @ClientIp() ip: string) {
    if (!['review', 'refund', 'reject'].includes(decision)) throw new BadRequestException('Unknown decision');
    return this.admin.decideDispute(a, disputeId, decision as DisputeDecision, dto.reason ?? null, ip);
  }
}

/** Shop settlements (§2.3, §2.9). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('FINANCE')
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly admin: AdminOrdersService) {}

  @Get()
  list(@Query() q: AdminOrdersQuery) {
    const status = PAYOUT_STATUSES.includes(q.status as PayoutStatus) ? (q.status as PayoutStatus) : undefined;
    return this.admin.payouts({ status, shopId: q.shopId, page: q.page, pageSize: q.pageSize });
  }

  /** Schedule payouts for every shop's completed, unsettled orders. */
  @Post('generate')
  generate(@CurrentAdmin() a: AdminUser, @ClientIp() ip: string) {
    return this.admin.generatePayouts(a, ip);
  }

  /** processing | paid (reference required) | failed */
  @Post(':id/:action')
  update(@CurrentAdmin() a: AdminUser, @Param('id', id) payoutId: string, @Param('action') action: string, @Body() dto: ReferenceDto, @ClientIp() ip: string) {
    if (!['processing', 'paid', 'failed'].includes(action)) throw new BadRequestException('Unknown action');
    return this.admin.updatePayout(a, payoutId, action as PayoutAction, dto.reference?.trim() || null, ip);
  }
}

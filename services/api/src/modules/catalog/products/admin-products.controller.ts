import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PRODUCT_STATUSES, type ProductStatus } from '@talad/shared';
import { IsOptional, IsUUID } from 'class-validator';
import type { AdminUser } from '../../../generated/prisma/client.js';
import { AdminPageQuery, ReasonDto } from '../../admins/admin.dto.js';
import { AdminAuthGuard, ClientIp, CurrentAdmin, Permission } from '../../auth/admin-auth.guard.js';
import { AdminProductsService, type ProductDecision } from './admin-products.service.js';

class AdminProductsQuery extends AdminPageQuery {
  @IsOptional()
  @IsUUID('7')
  shopId?: string;
}

const id = new ParseUUIDPipe({ version: '7' });
const DECISIONS: ProductDecision[] = ['approve', 'reject', 'unpublish'];

/** Product oversight (§2.5): the review queue and taking down listings. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('products')
@Controller('admin/products')
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}

  /** `?status=PENDING&q=&shopId=&page=` */
  @Get()
  list(@Query() q: AdminProductsQuery) {
    const status = (PRODUCT_STATUSES as readonly string[]).includes(q.status ?? '') ? (q.status as ProductStatus) : undefined;
    return this.products.list({ status, q: q.q, shopId: q.shopId, page: q.page, pageSize: q.pageSize });
  }

  @Get(':id')
  detail(@Param('id', id) productId: string) {
    return this.products.detail(productId);
  }

  /** approve | reject | unpublish (reason required except to approve). */
  @Post(':id/:decision')
  decide(
    @CurrentAdmin() admin: AdminUser,
    @Param('id', id) productId: string,
    @Param('decision') decision: string,
    @Body() dto: ReasonDto,
    @ClientIp() ip: string,
  ) {
    if (!DECISIONS.includes(decision as ProductDecision)) throw new BadRequestException('Unknown decision');
    return this.products.decide(admin, productId, decision as ProductDecision, dto.reason ?? null, ip);
  }
}

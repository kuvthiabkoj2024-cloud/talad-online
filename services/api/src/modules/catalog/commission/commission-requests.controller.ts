import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AdminUser, Shop } from '../../../generated/prisma/client.js';
import { AdminAuthGuard, ClientIp, CurrentAdmin, Permission } from '../../auth/admin-auth.guard.js';
import { CurrentShop, ShopOwnerGuard } from '../../auth/shop-owner.guard.js';
import { CommissionBodyDto, CommissionRequestDto, CommissionRequestQuery, ReviewNoteDto } from './commission.dto.js';
import { CommissionRequestsService } from './commission-requests.service.js';

const id = new ParseUUIDPipe({ version: '7' });

/** Seller Center: ask for a product's own commission (§2.3). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/products/:id/commission')
export class ShopCommissionController {
  constructor(private readonly requests: CommissionRequestsService) {}

  @Get()
  get(@CurrentShop() shop: Shop, @Param('id', id) productId: string) {
    return this.requests.forShop(shop.id, productId);
  }

  @Post()
  request(@CurrentShop() shop: Shop, @Param('id', id) productId: string, @Body() dto: CommissionRequestDto) {
    return this.requests.request(shop.id, productId, dto);
  }

  /** Withdraws the request still waiting. */
  @Delete()
  cancel(@CurrentShop() shop: Shop, @Param('id', id) productId: string) {
    return this.requests.cancel(shop.id, productId);
  }
}

/** Admin: review shops' commission requests and set a product's own commission. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('shops.commission')
@Controller('admin')
export class AdminCommissionController {
  constructor(private readonly requests: CommissionRequestsService) {}

  @Get('commission-requests')
  list(@Query() q: CommissionRequestQuery) {
    return this.requests.list(q.status, q.page);
  }

  /** approve | reject, with an optional note to the shop. */
  @Post('commission-requests/:id/:decision')
  decide(
    @CurrentAdmin() admin: AdminUser,
    @Param('id', id) requestId: string,
    @Param('decision') decision: string,
    @Body() dto: ReviewNoteDto,
    @ClientIp() ip: string,
  ) {
    if (decision !== 'approve' && decision !== 'reject') throw new BadRequestException('Unknown decision');
    return this.requests.decide(admin, requestId, decision, dto.note ?? null, ip);
  }

  /** `commission: null` removes the product's own commission (back to its category / shop). */
  @Put('products/:id/commission')
  setProduct(@CurrentAdmin() admin: AdminUser, @Param('id', id) productId: string, @Body() dto: CommissionBodyDto, @ClientIp() ip: string) {
    return this.requests.setProduct(admin, productId, dto.commission, ip);
  }
}

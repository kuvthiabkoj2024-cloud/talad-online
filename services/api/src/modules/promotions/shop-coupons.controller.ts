import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { CouponActiveDto, CouponBatchDto, ShopCouponDto } from './shop-coupon.dto.js';
import { ShopCouponsService } from './shop-coupons.service.js';

const id = new ParseUUIDPipe({ version: '7' });
const batch = new ParseUUIDPipe({ version: '4' });

@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/coupons')
export class ShopCouponsController {
  constructor(private readonly coupons: ShopCouponsService) {}

  @Get()
  list(@CurrentShop() shop: Shop) {
    return this.coupons.list(shop.id);
  }

  @Post()
  create(@CurrentShop() shop: Shop, @Body() dto: ShopCouponDto) {
    return this.coupons.create(shop.id, dto);
  }

  /** Many distinct codes with the same rules, one per customer. */
  @Post('batch')
  createBatch(@CurrentShop() shop: Shop, @Body() dto: CouponBatchDto) {
    return this.coupons.createBatch(shop.id, dto);
  }

  @Patch('batch/:batchId')
  setBatchActive(@CurrentShop() shop: Shop, @Param('batchId', batch) batchId: string, @Body() dto: CouponActiveDto) {
    return this.coupons.setBatchActive(shop.id, batchId, dto.isActive);
  }

  /** Unused codes are deleted; used ones are kept, turned off. */
  @Delete('batch/:batchId')
  removeBatch(@CurrentShop() shop: Shop, @Param('batchId', batch) batchId: string) {
    return this.coupons.removeBatch(shop.id, batchId);
  }

  @Put(':id')
  update(@CurrentShop() shop: Shop, @Param('id', id) couponId: string, @Body() dto: ShopCouponDto) {
    return this.coupons.update(shop.id, couponId, dto);
  }

  /** Turn a coupon on or off without touching its rules. */
  @Patch(':id')
  setActive(@CurrentShop() shop: Shop, @Param('id', id) couponId: string, @Body() dto: CouponActiveDto) {
    return this.coupons.setActive(shop.id, couponId, dto.isActive);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentShop() shop: Shop, @Param('id', id) couponId: string) {
    return this.coupons.remove(shop.id, couponId);
  }
}

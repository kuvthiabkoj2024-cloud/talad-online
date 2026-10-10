import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { FlashSaleDto } from './flash-sale.dto.js';
import { CouponActiveDto } from './shop-coupon.dto.js';
import { ShopFlashSalesService } from './shop-flash-sales.service.js';

const id = new ParseUUIDPipe({ version: '7' });

/** Seller Center flash sales (§3.4). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/flash-sales')
export class ShopFlashSalesController {
  constructor(private readonly sales: ShopFlashSalesService) {}

  @Get()
  list(@CurrentShop() shop: Shop) {
    return this.sales.list(shop.id);
  }

  @Post()
  create(@CurrentShop() shop: Shop, @Body() dto: FlashSaleDto) {
    return this.sales.create(shop.id, dto);
  }

  @Put(':id')
  update(@CurrentShop() shop: Shop, @Param('id', id) saleId: string, @Body() dto: FlashSaleDto) {
    return this.sales.update(shop.id, saleId, dto);
  }

  @Patch(':id')
  setActive(@CurrentShop() shop: Shop, @Param('id', id) saleId: string, @Body() dto: CouponActiveDto) {
    return this.sales.setActive(shop.id, saleId, dto.isActive);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentShop() shop: Shop, @Param('id', id) saleId: string) {
    return this.sales.remove(shop.id, saleId);
  }
}

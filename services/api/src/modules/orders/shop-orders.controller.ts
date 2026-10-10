import { Body, Controller, Get, Param, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { ListShopOrdersQuery, ShopOrderActionDto } from './shop-orders.dto.js';
import { ShopOrdersService } from './shop-orders.service.js';

/** Seller Center order management (§3.6). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/orders')
export class ShopOrdersController {
  constructor(private readonly orders: ShopOrdersService) {}

  /** `?tab=to-pay|to-ship|shipping|returns|completed|cancelled&q=&page=1`, newest first. */
  @Get()
  list(@CurrentShop() shop: Shop, @Query() query: ListShopOrdersQuery) {
    return this.orders.list(shop.id, query);
  }

  /** Couriers to choose from when shipping. */
  @Get('delivery-providers')
  deliveryProviders() {
    return this.orders.deliveryProviders();
  }

  @Get(':number')
  detail(@CurrentShop() shop: Shop, @Param('number') number: string) {
    return this.orders.detail(shop.id, number);
  }

  @Get(':number/slip')
  async slip(@CurrentShop() shop: Shop, @Param('number') number: string) {
    const file = await this.orders.slip(shop.id, number);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  /** Confirm payment, pack, ship, deliver, cancel or handle a return. */
  @Post(':number/actions')
  act(@CurrentShop() shop: Shop, @Param('number') number: string, @Body() dto: ShopOrderActionDto) {
    return this.orders.act(shop, number, dto);
  }
}

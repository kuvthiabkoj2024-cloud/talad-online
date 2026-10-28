import { Body, Controller, Get, Param, Post, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SHOP_PROFILE_RULES } from '@talad/shared';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { ListShopOrdersQuery, ShopOrderActionDto } from './shop-orders.dto.js';
import { ShopCodService } from './shop-cod.service.js';
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

  /** The courier bill photo for shipping; send the returned key with the `ship` action. */
  @Post(':number/bill')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: SHOP_PROFILE_RULES.imageMaxBytes, files: 1 } }))
  uploadBill(@CurrentShop() shop: Shop, @Param('number') number: string, @UploadedFile() file?: Express.Multer.File) {
    return this.orders.uploadBill(shop, number, file);
  }

  @Get(':number/bill')
  async bill(@CurrentShop() shop: Shop, @Param('number') number: string) {
    const file = await this.orders.bill(shop.id, number);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  /** Ship (with the bill), out of stock, deliver, cancel or handle a return. */
  @Post(':number/actions')
  act(@CurrentShop() shop: Shop, @Param('number') number: string, @Body() dto: ShopOrderActionDto) {
    return this.orders.act(shop, number, dto);
  }
}

class CodMonthQuery {
  /** `YYYY-MM` (Laos time); defaults to this month. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}

/** Cash on delivery: the month's COD sales and the commission the shop transfers to Taladonline. */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/cod')
export class ShopCodController {
  constructor(private readonly cod: ShopCodService) {}

  @Get()
  month(@CurrentShop() shop: Shop, @Query() q: CodMonthQuery) {
    return this.cod.month(shop.id, q.month);
  }

  /** Taladonline's QR to transfer the commission to. */
  @Get('payment-qr')
  async qr() {
    const file = await this.cod.platformQr();
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }
}

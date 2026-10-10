import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { MEDIA_LIMITS } from '@talad/shared';
import type { Shop } from '../../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../../auth/shop-owner.guard.js';
import { tempFileStorage } from '../../media/temp-file-storage.js';
import { ListShopProductsQuery, ShopProductDto } from './shop-product.dto.js';
import { ShopProductsService } from './shop-products.service.js';

const id = new ParseUUIDPipe({ version: '7' });

/** Seller Center product management for the signed-in owner's shop (§3.3). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/products')
export class ShopProductsController {
  constructor(private readonly products: ShopProductsService) {}

  /** `?status=DRAFT|PENDING|PUBLISHED|REJECTED&q=&page=1&pageSize=20`, recently edited first. */
  @Get()
  list(@CurrentShop() shop: Shop, @Query() query: ListShopProductsQuery) {
    return this.products.list(shop.id, query);
  }

  /** Upload a photo (PNG/JPG/WebP, ≤ 5 MB); attach it by key when saving the product. */
  @Post('images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_LIMITS.maxImageBytes } }))
  uploadImage(@CurrentShop() shop: Shop, @UploadedFile() file?: Express.Multer.File) {
    return this.products.uploadImage(shop.id, file);
  }

  /** Upload the short video (MP4/MOV/WebM, ≤ MEDIA_LIMITS.maxVideoBytes); streamed via a temp file, not memory. */
  @Post('video')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', { storage: tempFileStorage, limits: { fileSize: MEDIA_LIMITS.maxVideoBytes, files: 1 } }),
  )
  uploadVideo(@CurrentShop() shop: Shop, @UploadedFile() file?: Express.Multer.File) {
    return this.products.uploadVideo(shop.id, file);
  }

  @Get(':id')
  get(@CurrentShop() shop: Shop, @Param('id', id) productId: string) {
    return this.products.get(shop.id, productId);
  }

  @Post()
  create(@CurrentShop() shop: Shop, @Body() dto: ShopProductDto) {
    return this.products.create(shop, dto);
  }

  @Put(':id')
  update(@CurrentShop() shop: Shop, @Param('id', id) productId: string, @Body() dto: ShopProductDto) {
    return this.products.update(shop, productId, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentShop() shop: Shop, @Param('id', id) productId: string) {
    return this.products.remove(shop, productId);
  }
}

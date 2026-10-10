import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SHOP_PROFILE_RULES } from '@talad/shared';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { ShopProfileDto } from './shop-profile.dto.js';
import { ShopProfileService, type ProfileImage } from './shop-profile.service.js';

const KINDS: ProfileImage[] = ['logo', 'cover', 'payment-qr'];
const kindOf = (value: string): ProfileImage => {
  if (!KINDS.includes(value as ProfileImage)) throw new BadRequestException('Unknown image');
  return value as ProfileImage;
};

/** Seller Center shop profile and settings (§3.2, §3.6 deadlines, §6 manual payments). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/profile')
export class ShopProfileController {
  constructor(private readonly profile: ShopProfileService) {}

  @Get()
  get(@CurrentShop() shop: Shop) {
    return this.profile.get(shop);
  }

  @Put()
  update(@CurrentShop() shop: Shop, @Body() dto: ShopProfileDto) {
    return this.profile.update(shop, dto);
  }

  @Get('payment-qr')
  async qr(@CurrentShop() shop: Shop) {
    const file = await this.profile.paymentQr(shop);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength });
  }

  /** `logo`, `cover` or `payment-qr` (PNG/JPG/WebP, ≤ 5 MB). */
  @Post(':kind')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: SHOP_PROFILE_RULES.imageMaxBytes } }))
  upload(@CurrentShop() shop: Shop, @Param('kind') kind: string, @UploadedFile() file?: Express.Multer.File) {
    return this.profile.upload(shop, kindOf(kind), file);
  }

  @Delete(':kind')
  remove(@CurrentShop() shop: Shop, @Param('kind') kind: string) {
    return this.profile.removeImage(shop, kindOf(kind));
  }
}

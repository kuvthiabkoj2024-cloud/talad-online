import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { ShopReviewsService } from './shop-reviews.service.js';

class ListShopReviewsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unreplied?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;
}

class ReplyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  reply: string | null;
}

/** Seller Center reviews (§3.8). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/reviews')
export class ShopReviewsController {
  constructor(private readonly reviews: ShopReviewsService) {}

  /** `?rating=1..5&unreplied=true&page=1` */
  @Get()
  list(@CurrentShop() shop: Shop, @Query() query: ListShopReviewsQuery) {
    return this.reviews.list(shop.id, query);
  }

  @Put(':id/reply')
  reply(@CurrentShop() shop: Shop, @Param('id', new ParseUUIDPipe({ version: '7' })) id: string, @Body() dto: ReplyDto) {
    return this.reviews.reply(shop.id, id, dto.reply);
  }
}

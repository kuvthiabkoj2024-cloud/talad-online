import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { ShopCustomersService } from './shop-customers.service.js';

class ListShopCustomersQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  /** `true` → only blacklisted customers. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  blacklisted: boolean = false;

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

class CustomerNoteDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || null : value))
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsBoolean()
  blacklisted: boolean;
}

const id = new ParseUUIDPipe({ version: '7' });

/** Seller Center customers (§3.5). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/customers')
export class ShopCustomersController {
  constructor(private readonly customers: ShopCustomersService) {}

  @Get()
  list(@CurrentShop() shop: Shop, @Query() query: ListShopCustomersQuery) {
    return this.customers.list(shop.id, query.q, query.blacklisted, query.page, query.pageSize);
  }

  @Get(':customerId/orders')
  orders(@CurrentShop() shop: Shop, @Param('customerId', id) customerId: string) {
    return this.customers.orders(shop.id, customerId);
  }

  /** Private note and blacklist (blacklisted buyers can't order from this shop). */
  @Put(':customerId')
  update(@CurrentShop() shop: Shop, @Param('customerId', id) customerId: string, @Body() dto: CustomerNoteDto) {
    return this.customers.updateNote(shop.id, customerId, dto.note ?? null, dto.blacklisted);
  }
}

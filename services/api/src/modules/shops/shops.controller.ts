import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { SHOP_PRODUCT_SORTS, type ShopProductSort } from '../catalog/products/products.service.js';
import { ShopsService } from './shops.service.js';

class ShopProductsQuery {
  /** Search within the shop (name or SKU). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(SHOP_PRODUCT_SORTS)
  sort: ShopProductSort = 'popular';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  pageSize: number = 12;
}

@ApiTags('shops')
@Controller('shops/:slug')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  profile(@Param('slug') slug: string) {
    return this.shops.profile(slug);
  }

  /** `?q=&sort=popular|new|price_asc|price_desc&page=1&pageSize=12` */
  @Get('products')
  products(@Param('slug') slug: string, @Query() query: ShopProductsQuery) {
    return this.shops.products(slug, query.q, query.sort, query.page, query.pageSize);
  }
}

/** The signed-in account's own shop — for the seller center, which signs in with the same account. */
@ApiTags('shops')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/shop')
export class MyShopController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  mine(@CurrentCustomer() customer: Customer) {
    return this.shops.ownedBy(customer.id);
  }
}

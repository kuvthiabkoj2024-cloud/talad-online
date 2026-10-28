import { Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { Customer, Shop } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { ShopFollowsService } from './shop-follows.service.js';

const id = new ParseUUIDPipe({ version: '7' });

class FollowerPageQuery {
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 20;
}

class FollowStatusQuery {
  /** Comma-separated shop ids (one feed page). */
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('7', { each: true })
  ids: string[] = [];
}

/** Customers following shops (§3.2). */
@ApiTags('shops')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/follows')
export class MyFollowsController {
  constructor(private readonly follows: ShopFollowsService) {}

  @Get()
  mine(@CurrentCustomer() c: Customer) {
    return this.follows.mine(c.id);
  }

  /** Which of these shops the customer follows (the feed is cached, so it asks separately). */
  @Get('status')
  status(@CurrentCustomer() c: Customer, @Query() q: FollowStatusQuery) {
    return this.follows.followingAmong(c.id, q.ids);
  }

  @Get(':shopId')
  state(@CurrentCustomer() c: Customer, @Param('shopId', id) shopId: string) {
    return this.follows.state(c.id, shopId);
  }

  @Put(':shopId')
  follow(@CurrentCustomer() c: Customer, @Param('shopId', id) shopId: string) {
    return this.follows.set(c.id, shopId, true);
  }

  @Delete(':shopId')
  unfollow(@CurrentCustomer() c: Customer, @Param('shopId', id) shopId: string) {
    return this.follows.set(c.id, shopId, false);
  }
}

/** Seller Center: the shop's followers. */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/followers')
export class ShopFollowersController {
  constructor(private readonly follows: ShopFollowsService) {}

  @Get()
  list(@CurrentShop() shop: Shop, @Query() q: FollowerPageQuery) {
    return this.follows.followers(shop.id, q.cursor, q.limit);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { LOCALES } from '@talad/shared';
import type { Customer, Shop } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { PushService } from './push.service.js';

class PushKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth: string;
}

/** A browser's `PushSubscription.toJSON()`, plus the app's language. */
class PushSubscriptionDto {
  @IsUrl({ protocols: ['https'], require_tld: false })
  @MaxLength(1000)
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;

  @IsOptional()
  @IsIn(LOCALES)
  locale?: string;
}

class PushEndpointDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  endpoint: string;
}

@ApiTags('push')
@Controller('push')
export class PushConfigController {
  constructor(private readonly push: PushService) {}

  /** The VAPID public key browsers subscribe with (`publicKey: null` = push is off). */
  @Get('config')
  config() {
    return this.push.config();
  }
}

/** Storefront: this browser gets the account's notifications and chat replies. */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/push-subscription')
export class CustomerPushController {
  constructor(private readonly push: PushService) {}

  @Put()
  @HttpCode(204)
  subscribe(@CurrentCustomer() c: Customer, @Body() body: PushSubscriptionDto) {
    return this.push.subscribe({ customerId: c.id }, body);
  }

  @Delete()
  @HttpCode(204)
  unsubscribe(@CurrentCustomer() c: Customer, @Body() body: PushEndpointDto) {
    return this.push.unsubscribe({ customerId: c.id }, body.endpoint);
  }
}

/** Seller Center: this browser gets the shop's orders, activity and chat messages. */
@ApiTags('shop')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/push-subscription')
export class ShopPushController {
  constructor(private readonly push: PushService) {}

  @Put()
  @HttpCode(204)
  subscribe(@CurrentShop() s: Shop, @Body() body: PushSubscriptionDto) {
    return this.push.subscribe({ shopId: s.id }, body);
  }

  @Delete()
  @HttpCode(204)
  unsubscribe(@CurrentShop() s: Shop, @Body() body: PushEndpointDto) {
    return this.push.unsubscribe({ shopId: s.id }, body.endpoint);
  }
}

import { Body, Controller, Delete, Get, HttpCode, Injectable, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { Customer } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { MAX_PHONES } from './expo-push.service.js';

/** An Expo push token, e.g. ExponentPushToken[xxxxxxxx]. */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[\w-]+\]$/;

class PushDeviceDto {
  @IsString()
  @MaxLength(200)
  @Matches(EXPO_TOKEN)
  token: string;

  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';

  @IsOptional()
  @IsIn(['lo', 'en'])
  locale?: 'lo' | 'en';
}

class PushTokenDto {
  @IsString()
  @MaxLength(200)
  token: string;
}

class NotificationSettingsDto {
  /** Promotions and MC Mart news by push / SMS. */
  @IsBoolean()
  promotions: boolean;
}

@Injectable()
export class PhonePushService {
  constructor(private readonly prisma: PrismaService) {}

  /** Saves this phone for the account (it moves over if another account used it), keeping the newest few. */
  async register(customerId: string, dto: PushDeviceDto): Promise<void> {
    const data = { customerId, platform: dto.platform, locale: dto.locale ?? 'lo' };
    await this.prisma.pushDevice.upsert({ where: { token: dto.token }, create: { token: dto.token, ...data }, update: data });
    const old = await this.prisma.pushDevice.findMany({ where: { customerId }, orderBy: { updatedAt: 'desc' }, skip: MAX_PHONES, select: { id: true } });
    if (old.length) await this.prisma.pushDevice.deleteMany({ where: { id: { in: old.map((d) => d.id) } } });
  }

  async unregister(customerId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { customerId, token } });
  }

  async settings(customerId: string): Promise<{ promotions: boolean }> {
    const c = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { promoNotifications: true } });
    return { promotions: c.promoNotifications };
  }

  async saveSettings(customerId: string, dto: NotificationSettingsDto): Promise<{ promotions: boolean }> {
    await this.prisma.customer.update({ where: { id: customerId }, data: { promoNotifications: dto.promotions } });
    return { promotions: dto.promotions };
  }
}

/** The phone app's push registration: one Expo push token per phone, sent after sign-in. */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/push-devices')
export class PushDevicesController {
  constructor(private readonly phones: PhonePushService) {}

  @Put()
  @HttpCode(204)
  async register(@CurrentCustomer() c: Customer, @Body() dto: PushDeviceDto) {
    await this.phones.register(c.id, dto);
  }

  /** Signing out on this phone: stop sending to it. */
  @Delete()
  @HttpCode(204)
  async unregister(@CurrentCustomer() c: Customer, @Body() dto: PushTokenDto) {
    await this.phones.unregister(c.id, dto.token);
  }
}

/** Profile → Notifications: promotions on or off (orders and chats always come). */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/notification-settings')
export class NotificationSettingsController {
  constructor(private readonly phones: PhonePushService) {}

  @Get()
  get(@CurrentCustomer() c: Customer) {
    return this.phones.settings(c.id);
  }

  @Put()
  save(@CurrentCustomer() c: Customer, @Body() dto: NotificationSettingsDto) {
    return this.phones.saveSettings(c.id, dto);
  }
}

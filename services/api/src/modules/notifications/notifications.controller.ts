import { Controller, Get, HttpCode, Param, ParseEnumPipe, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import type { AdminUser, Customer, Shop } from '../../generated/prisma/client.js';
import { AdminAuthGuard, CurrentAdmin } from '../auth/admin-auth.guard.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { ListNotificationsQuery, ReadAllQuery } from './list-notifications.query.js';
import { NotificationsService, SHOP_BADGE_SECTIONS, type ShopBadgeSection } from './notifications.service.js';

const id = new ParseUUIDPipe({ version: '7' });
const section = new ParseEnumPipe(Object.fromEntries(SHOP_BADGE_SECTIONS.map((s) => [s, s])));

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** `?tab=orders|promotions|updates&page=1&pageSize=20`, newest first. */
  @Get()
  list(@CurrentCustomer() c: Customer, @Query() query: ListNotificationsQuery) {
    return this.notifications.list(c.id, query);
  }

  /** For the header bell badge. */
  @Get('unread-count')
  unreadCount(@CurrentCustomer() c: Customer) {
    return this.notifications.unreadCount(c.id);
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentCustomer() c: Customer, @Query() query: ReadAllQuery) {
    return this.notifications.markAllRead(c.id, query.tab);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentCustomer() c: Customer, @Param('id', id) notificationId: string) {
    return this.notifications.markRead(c.id, notificationId);
  }
}

class InboxQuery {
  /** The last notification id already shown (next page). */
  @IsOptional()
  @IsUUID('7')
  cursor?: string;
}

/** Seller Center bell: the shop's notifications (orders, activity, approval…). */
@ApiTags('shop')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/notifications')
export class ShopNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentShop() s: Shop, @Query() q: InboxQuery) {
    return this.notifications.inbox({ shopId: s.id }, q.cursor);
  }

  @Get('unread-count')
  unread(@CurrentShop() s: Shop) {
    return this.notifications.inboxUnread({ shopId: s.id });
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentShop() s: Shop) {
    return this.notifications.inboxRead({ shopId: s.id });
  }

  /** Unread counts behind the "new" badges on the Orders and Videos tiles. */
  @Get('badges')
  badges(@CurrentShop() s: Shop) {
    return this.notifications.shopBadges(s.id);
  }

  /** Opening Orders or Videos clears that section's badge. */
  @Post('read-section/:section')
  @HttpCode(204)
  readSection(@CurrentShop() s: Shop, @Param('section', section) name: ShopBadgeSection) {
    return this.notifications.shopSectionRead(s.id, name);
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentShop() s: Shop, @Param('id', id) notificationId: string) {
    return this.notifications.inboxRead({ shopId: s.id }, notificationId);
  }
}

/** Admin bell: staff notifications (new shops to review…). Each admin has their own read state. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentAdmin() a: AdminUser, @Query() q: InboxQuery) {
    return this.notifications.inbox({ adminId: a.id }, q.cursor);
  }

  @Get('unread-count')
  unread(@CurrentAdmin() a: AdminUser) {
    return this.notifications.inboxUnread({ adminId: a.id });
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentAdmin() a: AdminUser) {
    return this.notifications.inboxRead({ adminId: a.id });
  }

  @Post(':id/read')
  @HttpCode(204)
  read(@CurrentAdmin() a: AdminUser, @Param('id', id) notificationId: string) {
    return this.notifications.inboxRead({ adminId: a.id }, notificationId);
  }
}

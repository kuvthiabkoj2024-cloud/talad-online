import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { ListNotificationsQuery, ReadAllQuery } from './list-notifications.query.js';
import { NotificationsService } from './notifications.service.js';

const id = new ParseUUIDPipe({ version: '7' });

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

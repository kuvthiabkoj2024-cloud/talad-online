import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AdminUser, Customer, Shop } from '../../generated/prisma/client.js';
import { AdminAuthGuard, CurrentAdmin } from '../auth/admin-auth.guard.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Live event streams (Server-Sent Events) for each kind of signed-in app. The connection stays
 * open; events arrive as `data: {json}` lines. Clients send the Bearer token like other calls.
 */
@ApiTags('realtime')
@ApiBearerAuth()
@Controller()
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  /** Storefront: this customer's notifications and chat replies. */
  @Get('me/events')
  @UseGuards(CustomerAuthGuard)
  customer(@CurrentCustomer() c: Customer, @Res() res: Response) {
    this.realtime.stream(res, [`customer:${c.id}`]);
  }

  /** Seller Center: the shop's orders, activity, messages and approval (pending shops too). */
  @Get('me/shop/events')
  @UseGuards(ShopOwnerGuard)
  shop(@CurrentShop() s: Shop, @Res() res: Response) {
    this.realtime.stream(res, [`shop:${s.id}`]);
  }

  /** Admin dashboard: new shop applications and other staff notifications. */
  @Get('admin/events')
  @UseGuards(AdminAuthGuard)
  admin(@CurrentAdmin() a: AdminUser, @Res() res: Response) {
    this.realtime.stream(res, [`admin:${a.id}`]);
  }
}

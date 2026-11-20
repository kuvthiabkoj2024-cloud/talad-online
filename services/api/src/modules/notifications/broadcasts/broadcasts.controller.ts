import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AdminUser } from '../../../generated/prisma/client.js';
import { AdminAuthGuard, CurrentAdmin, Permission } from '../../auth/admin-auth.guard.js';
import { AudienceCountQuery, CreateBroadcastDto, TargetSearchQuery } from './broadcasts.dto.js';
import { BroadcastsService } from './broadcasts.service.js';

const id = new ParseUUIDPipe({ version: '7' });

/** Admin console → Notifications: send or schedule messages to customers and shops (§2.11). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('announcements')
@Controller('admin/broadcasts')
export class AdminBroadcastsController {
  constructor(private readonly broadcasts: BroadcastsService) {}

  @Get()
  list() {
    return this.broadcasts.list();
  }

  @Post()
  create(@CurrentAdmin() a: AdminUser, @Body() dto: CreateBroadcastDto) {
    return this.broadcasts.create(a, dto);
  }

  /** The "one customer / one shop" picker. */
  @Get('targets')
  targets(@Query() q: TargetSearchQuery) {
    return this.broadcasts.searchTargets(q.kind, q.q);
  }

  /** Recipients, and how many have the app / web push, before sending. */
  @Get('audience-count')
  count(@Query() q: AudienceCountQuery) {
    return this.broadcasts.countAudience(q);
  }

  @Post(':id/pause')
  @HttpCode(200)
  pause(@CurrentAdmin() a: AdminUser, @Param('id', id) broadcastId: string) {
    return this.broadcasts.pause(a, broadcastId);
  }

  @Post(':id/resume')
  @HttpCode(200)
  resume(@CurrentAdmin() a: AdminUser, @Param('id', id) broadcastId: string) {
    return this.broadcasts.resume(a, broadcastId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentAdmin() a: AdminUser, @Param('id', id) broadcastId: string) {
    await this.broadcasts.remove(a, broadcastId);
  }
}

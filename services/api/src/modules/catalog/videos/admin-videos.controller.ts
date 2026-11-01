import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import type { AdminUser } from '../../../generated/prisma/client.js';
import { AdminPageQuery, ReasonDto } from '../../admins/admin.dto.js';
import { AdminAuthGuard, ClientIp, CurrentAdmin, Permission } from '../../auth/admin-auth.guard.js';
import { ADMIN_VIDEO_KINDS, AdminVideosService, type AdminVideoKind } from './admin-videos.service.js';

class AdminVideosQuery extends AdminPageQuery {
  /** One customer's videos. */
  @IsOptional()
  @IsUUID('7')
  customerId?: string;
}

const id = new ParseUUIDPipe({ version: '7' });

const kindOf = (kind: string): AdminVideoKind => {
  if (!(ADMIN_VIDEO_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Unknown video kind');
  return kind as AdminVideoKind;
};

/** Customers' and shops' videos: what's out there, who engaged, and hiding them from the feed. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('videos')
@Controller('admin/videos')
export class AdminVideosController {
  constructor(private readonly videos: AdminVideosService) {}

  /** `?status=hidden|visible&q=&customerId=&page=` */
  @Get(':kind')
  list(@Param('kind') kind: string, @Query() q: AdminVideosQuery) {
    return this.videos.list(kindOf(kind), q);
  }

  @Get(':kind/:id/comments')
  comments(@Param('kind') kind: string, @Param('id', id) videoId: string, @Query() q: AdminPageQuery) {
    return this.videos.comments(kindOf(kind), videoId, q.page, q.pageSize);
  }

  @Get(':kind/:id/likes')
  likes(@Param('kind') kind: string, @Param('id', id) videoId: string, @Query() q: AdminPageQuery) {
    return this.videos.likes(kindOf(kind), videoId, q.page, q.pageSize);
  }

  /** `reason` is shown to the video's owner. */
  @Post(':kind/:id/hide')
  hide(@CurrentAdmin() a: AdminUser, @Param('kind') kind: string, @Param('id', id) videoId: string, @Body() dto: ReasonDto, @ClientIp() ip: string) {
    const reason = dto.reason?.trim();
    if (!reason) throw new BadRequestException({ code: 'REASON_REQUIRED', message: 'Say why the video is hidden' });
    return this.videos.setHidden(a, kindOf(kind), videoId, true, reason, ip);
  }

  @Post(':kind/:id/unhide')
  unhide(@CurrentAdmin() a: AdminUser, @Param('kind') kind: string, @Param('id', id) videoId: string, @Body() dto: ReasonDto, @ClientIp() ip: string) {
    return this.videos.setHidden(a, kindOf(kind), videoId, false, dto.reason?.trim() || null, ip);
  }
}

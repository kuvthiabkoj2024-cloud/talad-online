import { Controller, Delete, Get, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsUUID } from 'class-validator';
import type { Customer } from '../../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../../auth/customer-auth.guard.js';
import { ProfilesService } from './profiles.service.js';
import { CommentPageQuery } from './videos.controller.js';

const id = new ParseUUIDPipe({ version: '7' });

class ProfileStatusQuery {
  /** Comma-separated customer ids (one feed page). */
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('7', { each: true })
  ids: string[] = [];
}

/** Customers' public profiles: numbers, videos and followers. */
@ApiTags('catalog')
@Controller('profiles/:customerId')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  profile(@Param('customerId', id) customerId: string) {
    return this.profiles.profile(customerId);
  }

  @Get('videos')
  videos(@Param('customerId', id) customerId: string, @Query() q: CommentPageQuery) {
    return this.profiles.videos(customerId, q.cursor, q.limit);
  }

  @Get('followers')
  followers(@Param('customerId', id) customerId: string, @Query() q: CommentPageQuery) {
    return this.profiles.followers(customerId, q.cursor, q.limit);
  }
}

/** Following other customers. */
@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/profile-follows')
export class MyProfileFollowsController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('status')
  status(@CurrentCustomer() c: Customer, @Query() q: ProfileStatusQuery) {
    return this.profiles.followingAmong(c.id, q.ids);
  }

  @Put(':customerId')
  follow(@CurrentCustomer() c: Customer, @Param('customerId', id) customerId: string) {
    return this.profiles.setFollow(c.id, customerId, true);
  }

  @Delete(':customerId')
  unfollow(@CurrentCustomer() c: Customer, @Param('customerId', id) customerId: string) {
    return this.profiles.setFollow(c.id, customerId, false);
  }
}

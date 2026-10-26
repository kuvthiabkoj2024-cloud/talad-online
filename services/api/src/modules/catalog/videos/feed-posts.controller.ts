import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FEED_POST_RULES, MEDIA_LIMITS } from '@talad/shared';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Customer } from '../../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../../auth/customer-auth.guard.js';
import { tempFileStorage } from '../../media/temp-file-storage.js';
import { FeedPostsService } from './feed-posts.service.js';

const id = new ParseUUIDPipe({ version: '7' });

class CreatePostDto {
  @IsOptional()
  @IsString()
  @MaxLength(FEED_POST_RULES.captionMax)
  caption?: string;
}

class LikeStatusQuery {
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('7', { each: true })
  ids: string[] = [];
}

/** Public counters on customers' feed videos. */
@ApiTags('catalog')
@Controller('feed-posts/:id')
export class FeedPostsController {
  constructor(private readonly posts: FeedPostsService) {}

  @Get()
  one(@Param('id', id) postId: string) {
    return this.posts.one(postId);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('views')
  @HttpCode(200)
  view(@Param('id', id) postId: string) {
    return this.posts.view(postId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('shares')
  @HttpCode(200)
  share(@Param('id', id) postId: string) {
    return this.posts.share(postId);
  }
}

/** Signed-in customers: post their own videos, delete them, like posts. */
@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/feed-posts')
export class MyFeedPostsController {
  constructor(private readonly posts: FeedPostsService) {}

  /** A video (MP4/MOV/WebM, ≤ MEDIA_LIMITS.maxVideoBytes) and an optional caption. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: tempFileStorage, limits: { fileSize: MEDIA_LIMITS.maxVideoBytes, files: 1 } }))
  create(@CurrentCustomer() c: Customer, @Body() dto: CreatePostDto, @UploadedFile() file?: Express.Multer.File) {
    return this.posts.create(c.id, file, dto.caption);
  }

  @Get('likes')
  likes(@CurrentCustomer() c: Customer, @Query() q: LikeStatusQuery) {
    return this.posts.likedAmong(c.id, q.ids);
  }

  @Delete(':id')
  remove(@CurrentCustomer() c: Customer, @Param('id', id) postId: string) {
    return this.posts.remove(c.id, postId);
  }

  @Put(':id/like')
  like(@CurrentCustomer() c: Customer, @Param('id', id) postId: string) {
    return this.posts.setLike(c.id, postId, true);
  }

  @Delete(':id/like')
  unlike(@CurrentCustomer() c: Customer, @Param('id', id) postId: string) {
    return this.posts.setLike(c.id, postId, false);
  }
}

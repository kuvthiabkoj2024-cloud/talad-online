import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import type { Customer, Shop } from '../../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../../auth/customer-auth.guard.js';
import { CurrentShop, ShopOwnerGuard } from '../../auth/shop-owner.guard.js';
import { COMMENT_MAX_LENGTH, VideoEngagementService } from './video-engagement.service.js';

const id = new ParseUUIDPipe({ version: '7' });

export class CommentPageQuery {
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

export class AddCommentDto {
  @IsString()
  // Room for whitespace the service trims; the cleaned body is re-checked there.
  @MaxLength(COMMENT_MAX_LENGTH + 100)
  body: string;

  /** Set to reply; replying to a reply joins its thread. */
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

class ShopVideoListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 24;

  /** Just this one video (a notification's link). */
  @IsOptional()
  @IsUUID('7')
  productId?: string;
}

class FavoriteStatusQuery {
  /** Comma-separated product ids (one feed page). */
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('7', { each: true })
  ids: string[];
}

/** Public side of feed videos: counts, plays, shares and reading comments (§2.5). */
@ApiTags('catalog')
@Controller('products/:productId/video')
export class VideosController {
  constructor(private readonly videos: VideoEngagementService) {}

  @Get('stats')
  stats(@Param('productId', id) productId: string) {
    return this.videos.stats(productId);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('views')
  view(@Param('productId', id) productId: string) {
    return this.videos.recordView(productId);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('shares')
  share(@Param('productId', id) productId: string) {
    return this.videos.recordShare(productId);
  }

  @Get('comments')
  comments(@Param('productId', id) productId: string, @Query() q: CommentPageQuery) {
    return this.videos.comments({ productId }, q.cursor, q.limit);
  }

  @Get('comments/:commentId/replies')
  replies(@Param('productId', id) productId: string, @Param('commentId', id) commentId: string, @Query() q: CommentPageQuery) {
    return this.videos.replies({ productId }, commentId, q.cursor, q.limit);
  }
}

/** Signed-in side: commenting and favoriting (§4.7 favorites = wishlist). */
@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me')
export class MyVideosController {
  constructor(private readonly videos: VideoEngagementService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('videos/:productId/comments')
  comment(@CurrentCustomer() c: Customer, @Param('productId', id) productId: string, @Body() dto: AddCommentDto) {
    return this.videos.addComment(c.id, { productId }, dto.body, dto.parentId);
  }

  @Delete('videos/comments/:commentId')
  deleteComment(@CurrentCustomer() c: Customer, @Param('commentId', id) commentId: string) {
    return this.videos.deleteComment(c.id, commentId);
  }

  @Get('favorites/status')
  favoriteStatus(@CurrentCustomer() c: Customer, @Query() q: FavoriteStatusQuery) {
    return this.videos.favoritedAmong(c.id, q.ids);
  }

  @Put('favorites/:productId')
  favorite(@CurrentCustomer() c: Customer, @Param('productId', id) productId: string) {
    return this.videos.setFavorite(c.id, productId, true);
  }

  @Delete('favorites/:productId')
  unfavorite(@CurrentCustomer() c: Customer, @Param('productId', id) productId: string) {
    return this.videos.setFavorite(c.id, productId, false);
  }
}

/** Seller Center: the shop's videos, who liked them, and answering comments as the shop. */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/videos')
export class ShopVideosController {
  constructor(private readonly videos: VideoEngagementService) {}

  @Get()
  list(@CurrentShop() shop: Shop, @Query() q: ShopVideoListQuery) {
    return this.videos.shopVideos(shop.id, q.page, q.pageSize, q.productId);
  }

  @Get(':productId/likes')
  likes(@CurrentShop() shop: Shop, @Param('productId', id) productId: string, @Query() q: CommentPageQuery) {
    return this.videos.shopLikes(shop.id, productId, q.cursor, q.limit);
  }

  @Get(':productId/comments')
  comments(@CurrentShop() shop: Shop, @Param('productId', id) productId: string, @Query() q: CommentPageQuery) {
    return this.videos.shopComments(shop.id, productId, q.cursor, q.limit);
  }

  @Get(':productId/comments/:commentId/replies')
  replies(@CurrentShop() shop: Shop, @Param('productId', id) productId: string, @Param('commentId', id) commentId: string, @Query() q: CommentPageQuery) {
    return this.videos.shopReplies(shop.id, productId, commentId, q.cursor, q.limit);
  }

  /** A comment or reply as the shop (the customer answered is notified). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':productId/comments')
  comment(@CurrentShop() shop: Shop, @Param('productId', id) productId: string, @Body() dto: AddCommentDto) {
    return this.videos.shopComment(shop, productId, dto.body, dto.parentId);
  }

  @Delete('comments/:commentId')
  deleteComment(@CurrentShop() shop: Shop, @Param('commentId', id) commentId: string) {
    return this.videos.shopDeleteComment(shop.id, commentId);
  }
}

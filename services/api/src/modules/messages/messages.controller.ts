import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import type { Customer, Shop } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import type { StoredObject } from '../media/storage.service.js';
import { ChatOrderItemsDto, toItems } from '../orders/chat-orders.controller.js';
import { MESSAGE_LIMITS, MessagesService, type Side } from './messages.service.js';

const id = new ParseUUIDPipe({ version: '7' });
/** A message's attachments: one `photo` and/or one `audio` (a voice message). Sizes are checked per kind in the service. */
const uploadFiles = FileFieldsInterceptor(
  [
    { name: 'photo', maxCount: 1 },
    { name: 'audio', maxCount: 1 },
  ],
  { limits: { fileSize: Math.max(MESSAGE_LIMITS.photoMaxBytes, MESSAGE_LIMITS.audioMaxBytes), files: 2 } },
);
type Uploads = { photo?: Express.Multer.File[]; audio?: Express.Multer.File[] };
/** A stored photo or voice message, streamed back inline. */
const image = (file: StoredObject) =>
  new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });

class StartDto {
  @IsString()
  @MaxLength(80)
  shop: string;
}

class SendDto {
  @IsOptional()
  @IsString()
  @MaxLength(MESSAGE_LIMITS.textMax)
  text?: string;

  @IsOptional()
  @IsUUID('7')
  productId?: string;

  /** A shared location (sent together with `longitude`). Form fields arrive as text. */
  @ValidateIf((o: SendDto) => o.latitude !== undefined || o.longitude !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((o: SendDto) => o.latitude !== undefined || o.longitude !== undefined)
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  /** How long the attached voice message is, in milliseconds. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(MESSAGE_LIMITS.audioMaxMs)
  audioMs?: number;
}

class ThreadQuery {
  @IsOptional()
  @IsUUID('7')
  after?: string;

  @IsOptional()
  @IsUUID('7')
  before?: string;
}

class ListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  q?: string;
}

/** The customer's private chats with shops (storefront → Messages). */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/conversations')
export class CustomerMessagesController {
  constructor(private readonly messages: MessagesService) {}

  private side = (c: Customer): Side => ({ kind: 'customer', customerId: c.id });

  @Get()
  list(@CurrentCustomer() c: Customer) {
    return this.messages.list(this.side(c));
  }

  @Get('unread-count')
  unread(@CurrentCustomer() c: Customer) {
    return this.messages.unreadCount(this.side(c));
  }

  /** `{ shop: slug }` → the conversation with that shop (created on first use). */
  @Post()
  @HttpCode(200)
  start(@CurrentCustomer() c: Customer, @Body() dto: StartDto) {
    return this.messages.start(c.id, dto.shop);
  }

  @Get(':id')
  thread(@CurrentCustomer() c: Customer, @Param('id', id) conversationId: string, @Query() q: ThreadQuery) {
    return this.messages.thread(this.side(c), conversationId, q);
  }

  /** Multipart: `text`, optional `productId`, `photo` (JPG/PNG/WebP ≤ 5 MB) and `audio` + `audioMs` (a voice message, ≤ 1 minute). */
  @Post(':id/messages')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(uploadFiles)
  send(@CurrentCustomer() c: Customer, @Param('id', id) conversationId: string, @Body() dto: SendDto, @UploadedFiles() files: Uploads = {}) {
    return this.messages.send(this.side(c), conversationId, { text: dto.text, productId: dto.productId, photo: files.photo?.[0], audio: files.audio?.[0], audioMs: dto.audioMs, location: dto.latitude !== undefined && dto.longitude !== undefined ? { lat: dto.latitude, lng: dto.longitude } : undefined });
  }

  @Get(':id/products/:productId')
  product(@CurrentCustomer() c: Customer, @Param('id', id) conversationId: string, @Param('productId', id) productId: string) {
    return this.messages.product(this.side(c), conversationId, productId);
  }

  /** Buy by chat: an order card for these items (the customer completes it on the card). */
  @Post(':id/orders')
  @HttpCode(200)
  order(@CurrentCustomer() c: Customer, @Param('id', id) conversationId: string, @Body() dto: ChatOrderItemsDto) {
    return this.messages.sendOrder(this.side(c), conversationId, toItems(dto.items));
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentCustomer() c: Customer, @Param('id', id) conversationId: string) {
    await this.messages.markRead(this.side(c), conversationId);
  }

  @Get(':id/messages/:messageId/photo')
  async photo(@CurrentCustomer() c: Customer, @Param('id', id) conversationId: string, @Param('messageId', id) messageId: string) {
    return image(await this.messages.photo(this.side(c), conversationId, messageId));
  }

  @Get(':id/messages/:messageId/audio')
  async audio(@CurrentCustomer() c: Customer, @Param('id', id) conversationId: string, @Param('messageId', id) messageId: string) {
    return image(await this.messages.audio(this.side(c), conversationId, messageId));
  }
}

/** The shop's private chats with customers (Seller Center → Messages). */
@ApiTags('shop')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/conversations')
export class ShopMessagesController {
  constructor(private readonly messages: MessagesService) {}

  private side = (s: Shop): Side => ({ kind: 'shop', shopId: s.id });

  @Get()
  list(@CurrentShop() s: Shop, @Query() q: ListQuery) {
    return this.messages.list(this.side(s), q.q?.trim() || undefined);
  }

  @Get('unread-count')
  unread(@CurrentShop() s: Shop) {
    return this.messages.unreadCount(this.side(s));
  }

  @Get(':id')
  thread(@CurrentShop() s: Shop, @Param('id', id) conversationId: string, @Query() q: ThreadQuery) {
    return this.messages.thread(this.side(s), conversationId, q);
  }

  @Post(':id/messages')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @UseInterceptors(uploadFiles)
  send(@CurrentShop() s: Shop, @Param('id', id) conversationId: string, @Body() dto: SendDto, @UploadedFiles() files: Uploads = {}) {
    return this.messages.send(this.side(s), conversationId, { text: dto.text, productId: dto.productId, photo: files.photo?.[0], audio: files.audio?.[0], audioMs: dto.audioMs, location: dto.latitude !== undefined && dto.longitude !== undefined ? { lat: dto.latitude, lng: dto.longitude } : undefined });
  }

  /** The shop sends an order card (Facebook-style selling); the customer checks it and places it. */
  @Post(':id/orders')
  @HttpCode(200)
  order(@CurrentShop() s: Shop, @Param('id', id) conversationId: string, @Body() dto: ChatOrderItemsDto) {
    return this.messages.sendOrder(this.side(s), conversationId, toItems(dto.items));
  }

  @Post(':id/orders/:orderId/cancel')
  @HttpCode(204)
  async cancelOrder(@CurrentShop() s: Shop, @Param('id', id) conversationId: string, @Param('orderId', id) orderId: string) {
    await this.messages.cancelOrder(s.id, conversationId, orderId);
  }

  @Post(':id/read')
  @HttpCode(204)
  async read(@CurrentShop() s: Shop, @Param('id', id) conversationId: string) {
    await this.messages.markRead(this.side(s), conversationId);
  }

  @Get(':id/messages/:messageId/photo')
  async photo(@CurrentShop() s: Shop, @Param('id', id) conversationId: string, @Param('messageId', id) messageId: string) {
    return image(await this.messages.photo(this.side(s), conversationId, messageId));
  }

  @Get(':id/messages/:messageId/audio')
  async audio(@CurrentShop() s: Shop, @Param('id', id) conversationId: string, @Param('messageId', id) messageId: string) {
    return image(await this.messages.audio(this.side(s), conversationId, messageId));
  }
}

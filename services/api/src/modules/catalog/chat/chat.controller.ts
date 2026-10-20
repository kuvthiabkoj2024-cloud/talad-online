import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MAX_CART_QUANTITY } from '@talad/shared';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import type { Customer } from '../../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../../auth/customer-auth.guard.js';
import { SessionService } from '../../auth/session.service.js';
import { PHOTO_SEARCH_LIMITS } from '../image-search/photo-search.service.js';
import { ChatService, type ChatTurn } from './chat.service.js';

class ChatDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;

  /** JSON array of earlier `{ role, text }` turns (the app keeps the conversation). */
  @IsOptional()
  @IsString()
  @MaxLength(20_000)
  history?: string;

  @IsOptional()
  @IsIn(['lo', 'en'])
  locale?: 'lo' | 'en';

  /** Small preview of the attached photo (JPEG data URL), kept in a signed-in customer's history. */
  @IsOptional()
  @IsString()
  @MaxLength(80_000)
  @Matches(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/)
  thumb?: string;
}

class StartOrderDto {
  @IsUUID('7')
  productId: string;

  @IsOptional()
  @IsUUID('7')
  variantId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_CART_QUANTITY)
  quantity?: number;

  @IsOptional()
  @IsIn(['lo', 'en'])
  locale?: 'lo' | 'en';
}

function parseHistory(raw?: string): ChatTurn[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) throw new Error();
    return list
      .filter((t): t is ChatTurn => !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string')
      .slice(-12);
  } catch {
    throw new BadRequestException({ code: 'INVALID_HISTORY', message: 'history must be a JSON array of { role, text }' });
  }
}

/** Market Chat: shop by chatting in Lao or English, or by sending a photo. Public (guests too). */
@ApiTags('catalog')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly sessions: SessionService,
  ) {}

  /** Multipart: `message`, `history` (JSON), `locale`, and an optional `photo` (JPG/PNG/WebP ≤ 8 MB). */
  @Post()
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: PHOTO_SEARCH_LIMITS.maxBytes, files: 1 } }))
  async send(@Body() dto: ChatDto, @Headers('authorization') auth?: string, @UploadedFile() photo?: Express.Multer.File) {
    // Guests chat too; a signed-in customer's chat is saved to (and read from) their account only.
    const [scheme, token] = (auth ?? '').split(' ');
    const session = scheme === 'Bearer' && token ? await this.sessions.resolve(token) : null;
    const customerId = session?.actorType === 'CUSTOMER' ? session.actorId : undefined;
    return this.chat.reply({ message: dto.message ?? '', history: parseHistory(dto.history), locale: dto.locale ?? 'lo', photo, customerId, thumb: dto.thumb });
  }

  /** Buy by chat: "Buy now" on a product card → an order card in the customer's Market Chat. */
  @Post('orders')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  startOrder(@CurrentCustomer() c: Customer, @Body() dto: StartOrderDto) {
    return this.chat.startOrder(c.id, { productId: dto.productId, variantId: dto.variantId ?? null, quantity: dto.quantity ?? 1 }, dto.locale ?? 'lo');
  }

  /** The signed-in customer's own Market Chat. */
  @Get('history')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  history(@CurrentCustomer() c: Customer) {
    return this.chat.history(c.id);
  }

  /** "New chat": clears the signed-in customer's Market Chat. */
  @Delete('history')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  async clear(@CurrentCustomer() c: Customer) {
    await this.chat.clear(c.id);
  }
}

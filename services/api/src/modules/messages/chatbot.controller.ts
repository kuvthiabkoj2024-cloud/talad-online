import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { CHATBOT_LIMITS, ChatbotService } from './chatbot.service.js';

const id = new ParseUUIDPipe({ version: '7' });

class FaqDto {
  @IsString()
  @MaxLength(CHATBOT_LIMITS.questionMax)
  question: string;

  @IsString()
  @MaxLength(CHATBOT_LIMITS.answerMax)
  answer: string;
}

class TurnDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(CHATBOT_LIMITS.previewMax)
  text: string;
}

class PreviewDto {
  @IsString()
  @MaxLength(CHATBOT_LIMITS.previewMax)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TurnDto)
  history?: TurnDto[];
}

/** Seller Center → Chat Bot: the FAQ the shop's bot answers from, and a "try it" box. */
@ApiTags('shop')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop/chatbot')
export class ChatbotController {
  constructor(private readonly chatbot: ChatbotService) {}

  @Get()
  overview(@CurrentShop() s: Shop) {
    return this.chatbot.overview(s.id);
  }

  @Post('faqs')
  create(@CurrentShop() s: Shop, @Body() dto: FaqDto) {
    return this.chatbot.create(s.id, dto);
  }

  @Patch('faqs/:id')
  update(@CurrentShop() s: Shop, @Param('id', id) faqId: string, @Body() dto: FaqDto) {
    return this.chatbot.update(s.id, faqId, dto);
  }

  @Delete('faqs/:id')
  @HttpCode(204)
  async remove(@CurrentShop() s: Shop, @Param('id', id) faqId: string) {
    await this.chatbot.remove(s.id, faqId);
  }

  @Post('preview')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  preview(@CurrentShop() s: Shop, @Body() dto: PreviewDto) {
    return this.chatbot.preview(s.id, dto.message, dto.history ?? []);
  }
}

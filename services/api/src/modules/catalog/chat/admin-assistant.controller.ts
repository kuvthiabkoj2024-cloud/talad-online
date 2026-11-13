import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ASSISTANT_TRAINING } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import type { AdminUser } from '../../../generated/prisma/client.js';
import { AdminAuthGuard, CurrentAdmin, Permission } from '../../auth/admin-auth.guard.js';
import { AssistantTrainingService } from './assistant-training.service.js';
import { ChatService } from './chat.service.js';

const id = new ParseUUIDPipe({ version: '7' });

class AnswerDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ASSISTANT_TRAINING.questionsMax)
  @IsString({ each: true })
  @MaxLength(ASSISTANT_TRAINING.questionMax, { each: true })
  questions: string[];

  @IsString()
  @MaxLength(ASSISTANT_TRAINING.answerMax)
  answerLo: string;

  @IsString()
  @MaxLength(ASSISTANT_TRAINING.answerMax)
  answerEn: string;

  @IsOptional()
  @IsString()
  @MaxLength(ASSISTANT_TRAINING.productWordsMax)
  productWords?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Taught from the inbox: that question leaves it. */
  @IsOptional()
  @Transform(({ value }) => value || undefined)
  @IsUUID('7')
  fromMiss?: string | null;
}

class WordDto {
  @IsString()
  @MaxLength(ASSISTANT_TRAINING.wordMax)
  word: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ASSISTANT_TRAINING.meansMax)
  @IsString({ each: true })
  @MaxLength(ASSISTANT_TRAINING.wordMax, { each: true })
  means: string[];

  @IsOptional()
  @Transform(({ value }) => value || undefined)
  @IsUUID('7')
  fromMiss?: string | null;
}

class MissesQuery {
  /** `true`: taught or dismissed ones; default the open inbox. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 30;
}

class ResolveDto {
  @IsBoolean()
  resolved: boolean;
}

class TestTurn {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(1000)
  text: string;
}

class TestDto {
  @IsString()
  @MaxLength(500)
  message: string;

  @IsOptional()
  @IsIn(['lo', 'en'])
  locale?: 'lo' | 'en';

  /** Earlier turns of the test conversation, for follow-ups ("how much?"). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => TestTurn)
  history?: TestTurn[];
}

/** Training Market Chat (Admin → Market Chat): answers, words, the unanswered inbox, and a test chat. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('assistant')
@Controller('admin/assistant')
export class AdminAssistantController {
  constructor(
    private readonly training: AssistantTrainingService,
    private readonly chat: ChatService,
  ) {}

  @Get()
  overview() {
    return this.training.overview();
  }

  @Get('answers')
  answers() {
    return this.training.listAnswers();
  }

  @Post('answers')
  createAnswer(@CurrentAdmin() a: AdminUser, @Body() dto: AnswerDto) {
    return this.training.saveAnswer(a, null, dto);
  }

  @Put('answers/:id')
  updateAnswer(@CurrentAdmin() a: AdminUser, @Param('id', id) answerId: string, @Body() dto: AnswerDto) {
    return this.training.saveAnswer(a, answerId, dto);
  }

  @Delete('answers/:id')
  @HttpCode(200)
  deleteAnswer(@CurrentAdmin() a: AdminUser, @Param('id', id) answerId: string) {
    return this.training.deleteAnswer(a, answerId);
  }

  @Get('words')
  words() {
    return this.training.listWords();
  }

  @Post('words')
  createWord(@CurrentAdmin() a: AdminUser, @Body() dto: WordDto) {
    return this.training.saveWord(a, null, dto);
  }

  @Put('words/:id')
  updateWord(@CurrentAdmin() a: AdminUser, @Param('id', id) wordId: string, @Body() dto: WordDto) {
    return this.training.saveWord(a, wordId, dto);
  }

  @Delete('words/:id')
  @HttpCode(200)
  deleteWord(@CurrentAdmin() a: AdminUser, @Param('id', id) wordId: string) {
    return this.training.deleteWord(a, wordId);
  }

  @Get('unanswered')
  unanswered(@Query() q: MissesQuery) {
    return this.training.misses(q);
  }

  @Patch('unanswered/:id')
  resolve(@CurrentAdmin() a: AdminUser, @Param('id', id) missId: string, @Body() dto: ResolveDto) {
    return this.training.resolveMiss(a, missId, dto.resolved);
  }

  /** What Market Chat would answer, and how (nothing is saved or counted). */
  @Post('test')
  @HttpCode(200)
  test(@Body() dto: TestDto) {
    return this.chat.reply({ message: dto.message, history: dto.history ?? [], locale: dto.locale ?? 'lo', test: true });
  }
}

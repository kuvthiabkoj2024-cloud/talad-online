import { BadRequestException, Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';
import type { Shop } from '../../generated/prisma/client.js';
import { CurrentShop, ShopOwnerGuard } from '../auth/shop-owner.guard.js';
import { ShopReportsService, STATS_RANGES, type StatsRange } from './shop-reports.service.js';

class PeriodQuery {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

class StatsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsIn(STATS_RANGES)
  days: StatsRange = 30;
}

/** Defaults to the current month; at most a year at a time. */
function period(q: PeriodQuery): { from: Date; to: Date } {
  const now = new Date();
  const from = q.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const to = q.to ?? now;
  if (to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) {
    throw new BadRequestException({ code: 'INVALID_PERIOD', message: 'Choose a period of up to a year' });
  }
  return { from, to };
}

/** Seller Center finance and statistics (§3.7). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(ShopOwnerGuard)
@Controller('me/shop')
export class ShopReportsController {
  constructor(private readonly reports: ShopReportsService) {}

  /** `?from=&to=` (ISO dates). */
  @Get('finance')
  finance(@CurrentShop() shop: Shop, @Query() query: PeriodQuery) {
    const { from, to } = period(query);
    return this.reports.finance(shop.id, from, to);
  }

  @Get('finance/statement')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  statement(@CurrentShop() shop: Shop, @Query() query: PeriodQuery) {
    const { from, to } = period(query);
    return this.reports.statement(shop.id, from, to);
  }

  /** `?days=7|30|90` */
  @Get('stats')
  stats(@CurrentShop() shop: Shop, @Query() query: StatsQuery) {
    return this.reports.stats(shop.id, query.days);
  }
}

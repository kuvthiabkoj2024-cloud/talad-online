import { BadRequestException, Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsIn, IsOptional } from 'class-validator';
import { AdminAuthGuard, Roles } from '../auth/admin-auth.guard.js';
import { AdminReportsService, type SalesGroup } from './admin-reports.service.js';

class DashboardQuery {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 30, 90])
  days: number = 30;
}

class ReportQuery {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @IsOptional()
  @IsIn(['shop', 'category', 'product'])
  group: SalesGroup = 'shop';
}

function period(q: ReportQuery) {
  const now = new Date();
  const from = q.from ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const to = q.to ?? now;
  if (to <= from || to.getTime() - from.getTime() > 366 * 86_400_000) {
    throw new BadRequestException({ code: 'INVALID_PERIOD', message: 'Choose a period of up to a year' });
  }
  return { from, to };
}

/** Admin dashboard (§2.2) — every role sees it. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminDashboardController {
  constructor(private readonly reports: AdminReportsService) {}

  @Get('dashboard')
  dashboard(@Query() q: DashboardQuery) {
    return this.reports.dashboard(q.days);
  }

  /** Counts for the sidebar badges. */
  @Get('alerts')
  alerts() {
    return this.reports.alerts();
  }
}

/** Reports (§2.9) — Finance and Super Admin. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('FINANCE')
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: AdminReportsService) {}

  /** `?group=shop|category|product&from=&to=` */
  @Get('sales')
  async sales(@Query() q: ReportQuery) {
    const { from, to } = period(q);
    return { from, to, group: q.group, rows: await this.reports.top(q.group, from, to, 200) };
  }

  @Get('sales.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  salesCsv(@Query() q: ReportQuery) {
    const { from, to } = period(q);
    return this.reports.salesCsv(q.group, from, to);
  }

  @Get('finance')
  finance(@Query() q: ReportQuery) {
    const { from, to } = period(q);
    return this.reports.finance(from, to);
  }

  @Get('customers')
  customers(@Query() q: ReportQuery) {
    const { from, to } = period(q);
    return this.reports.customers(from, to);
  }
}

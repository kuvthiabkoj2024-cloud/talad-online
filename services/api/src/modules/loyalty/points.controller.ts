import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { PointsService } from './points.service.js';

class PointsQuery {
  /** The last history row already shown (next page). */
  @IsOptional()
  @IsUUID()
  cursor?: string;
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/points')
export class MyPointsController {
  constructor(private readonly points: PointsService) {}

  /** Balance, its value in kip, the earn/spend rules and the history, newest first. */
  @Get()
  mine(@CurrentCustomer() c: Customer, @Query() q: PointsQuery) {
    return this.points.mine(c.id, q.cursor);
  }
}

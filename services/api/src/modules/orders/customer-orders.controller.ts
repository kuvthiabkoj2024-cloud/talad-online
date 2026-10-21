import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { ListOrdersQuery } from './list-orders.query.js';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/orders')
export class CustomerOrdersController {
  constructor(private readonly orders: CustomerOrdersService) {}

  /** `?tab=to-pay|to-ship|to-receive|completed|cancelled|refund&page=1&pageSize=5`. */
  @Get()
  list(@CurrentCustomer() customer: Customer, @Query() query: ListOrdersQuery) {
    return this.orders.list(customer.id, query);
  }

  @Get(':number')
  detail(@CurrentCustomer() customer: Customer, @Param('number') number: string) {
    return this.orders.detail(customer.id, number);
  }

  /** "I received it" on a delivered order: completes it now. */
  @Post(':number/receive')
  receive(@CurrentCustomer() customer: Customer, @Param('number') number: string) {
    return this.orders.receive(customer.id, number);
  }
}

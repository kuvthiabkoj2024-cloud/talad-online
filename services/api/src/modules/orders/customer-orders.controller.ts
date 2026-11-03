import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RETURN_RULES } from '@talad/shared';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { tempFileStorage } from '../media/temp-file-storage.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { ListOrdersQuery } from './list-orders.query.js';
import { CustomerReturnDto } from './order-returns.dto.js';
import { OrderReturnsService } from './order-returns.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/orders')
export class CustomerOrdersController {
  constructor(
    private readonly orders: CustomerOrdersService,
    private readonly returns: OrderReturnsService,
  ) {}

  /** `?tab=to-pay|to-ship|to-receive|completed|cancelled|refund&page=1&pageSize=5`. */
  @Get()
  list(@CurrentCustomer() customer: Customer, @Query() query: ListOrdersQuery) {
    return this.orders.list(customer.id, query);
  }

  @Get(':number')
  detail(@CurrentCustomer() customer: Customer, @Param('number') number: string) {
    return this.orders.detail(customer.id, number);
  }

  /** Cancel an unpaid transfer whose slips MC Mart rejected (or that has none). */
  @Post(':number/cancel')
  cancel(@CurrentCustomer() customer: Customer, @Param('number') number: string) {
    return this.orders.cancel(customer.id, number);
  }

  /** "I received it" on a delivered order: completes it now. */
  @Post(':number/receive')
  receive(@CurrentCustomer() customer: Customer, @Param('number') number: string) {
    return this.orders.receive(customer.id, number);
  }

  /** The courier's bill the shop uploaded is wrong: tells the shop to upload a new one. */
  @Post(':number/shipping-bill/report')
  reportBill(@CurrentCustomer() customer: Customer, @Param('number') number: string) {
    return this.orders.reportBill(customer.id, number);
  }

  /** One photo or video clip for a return; send the returned keys with the request. */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':number/return/evidence')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: tempFileStorage, limits: { fileSize: RETURN_RULES.videoMaxBytes, files: 1 } }))
  uploadReturnEvidence(@CurrentCustomer() customer: Customer, @Param('number') number: string, @UploadedFile() file?: Express.Multer.File) {
    return this.returns.uploadForCustomer(customer.id, number, file);
  }

  /** Asks MC Mart to take the order back: a reason and at least one photo or clip. */
  @Post(':number/return')
  requestReturn(@CurrentCustomer() customer: Customer, @Param('number') number: string, @Body() dto: CustomerReturnDto) {
    return this.returns.requestByCustomer(customer.id, number, dto);
  }
}

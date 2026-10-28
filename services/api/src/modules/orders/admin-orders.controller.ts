import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BANK_CODES, isShopOrderTab, type BankCode } from '@talad/shared';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { AdminUser, DisputeStatus, PayoutStatus } from '../../generated/prisma/client.js';
import { AdminPageQuery, ReasonDto } from '../admins/admin.dto.js';
import { AdminAuthGuard, ClientIp, CurrentAdmin, Permission } from '../auth/admin-auth.guard.js';
import { AdminOrdersService, type DisputeDecision, type PayoutAction } from './admin-orders.service.js';
import { PAYMENT_QUEUES, PaymentReviewService, REFUND_QUEUES, type PaymentQueue, type RefundQueue } from './payment-review.service.js';
import { PlatformAccountService } from './platform-account.service.js';
import { ShopOrdersService } from './shop-orders.service.js';

class AdminOrdersQuery extends AdminPageQuery {
  @IsOptional()
  @IsUUID('7')
  shopId?: string;

  @IsOptional()
  @IsUUID('7')
  customerId?: string;

  /** `transfer` (checked by Taladonline) or `cod`; omitted = both. */
  @IsOptional()
  @IsIn(['transfer', 'cod'])
  method?: 'transfer' | 'cod';
}

class ReferenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

const id = new ParseUUIDPipe({ version: '7' });
const DISPUTE_STATUSES: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_REJECTED'];
const PAYOUT_STATUSES: PayoutStatus[] = ['SCHEDULED', 'PROCESSING', 'PAID', 'FAILED'];

/** Platform-wide orders, read-only for support (§3.6). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('orders')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly orders: ShopOrdersService) {}

  /** `?method=transfer|cod&status=<shop order tab>&q=&shopId=&customerId=&page=` */
  @Get()
  list(@Query() q: AdminOrdersQuery) {
    return this.orders.list(null, { tab: isShopOrderTab(q.status) ? q.status : undefined, q: q.q, page: q.page, pageSize: q.pageSize }, q.customerId, q.method);
  }

  @Get(':number')
  async detail(@Param('number') number: string) {
    const { actions: _, ...order } = await this.orders.detail(null, number);
    return order;
  }

  @Get(':number/slip')
  async slip(@Param('number') number: string) {
    const file = await this.orders.slip(null, number);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }
}

/** Escalated returns and refund requests (§2.10). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('disputes')
@Controller('admin/disputes')
export class AdminDisputesController {
  constructor(private readonly admin: AdminOrdersService) {}

  @Get()
  list(@Query() q: AdminPageQuery) {
    const status = DISPUTE_STATUSES.includes(q.status as DisputeStatus) ? (q.status as DisputeStatus) : undefined;
    return this.admin.disputes({ status, page: q.page, pageSize: q.pageSize });
  }

  /** review | refund | reject (`reason` = the resolution shown to both sides). */
  @Post(':id/:decision')
  decide(@CurrentAdmin() a: AdminUser, @Param('id', id) disputeId: string, @Param('decision') decision: string, @Body() dto: ReasonDto, @ClientIp() ip: string) {
    if (!['review', 'refund', 'reject'].includes(decision)) throw new BadRequestException('Unknown decision');
    return this.admin.decideDispute(a, disputeId, decision as DisputeDecision, dto.reason ?? null, ip);
  }
}

/** Shop settlements (§2.3, §2.9). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('payouts')
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly admin: AdminOrdersService) {}

  @Get()
  list(@Query() q: AdminOrdersQuery) {
    const status = PAYOUT_STATUSES.includes(q.status as PayoutStatus) ? (q.status as PayoutStatus) : undefined;
    return this.admin.payouts({ status, shopId: q.shopId, q: q.q, page: q.page, pageSize: q.pageSize });
  }

  /** Schedule payouts for every shop's completed, unsettled orders. */
  @Post('generate')
  generate(@CurrentAdmin() a: AdminUser, @ClientIp() ip: string) {
    return this.admin.generatePayouts(a, ip);
  }

  @Get(':id')
  detail(@Param('id', id) payoutId: string) {
    return this.admin.payoutDetail(payoutId);
  }

  @Get(':id/qr')
  async qr(@Param('id', id) payoutId: string) {
    const file = await this.admin.payoutQr(payoutId);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  /** Taladonline's transfer slip (multipart field `file`), before marking it paid. */
  @Post(':id/slip')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadSlip(@CurrentAdmin() a: AdminUser, @Param('id', id) payoutId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.admin.uploadPayoutSlip(a, payoutId, file);
  }

  @Get(':id/slip')
  async slip(@Param('id', id) payoutId: string) {
    const file = await this.admin.payoutSlip(payoutId);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  /** paid (an uploaded slip required, reference optional) | failed */
  @Post(':id/:action')
  update(@CurrentAdmin() a: AdminUser, @Param('id', id) payoutId: string, @Param('action') action: string, @Body() dto: ReferenceDto, @ClientIp() ip: string) {
    if (!['paid', 'failed'].includes(action)) throw new BadRequestException('Unknown action');
    return this.admin.updatePayout(a, payoutId, action as PayoutAction, dto.reference?.trim() || null, ip);
  }
}

class PaymentQueueQuery extends AdminPageQuery {}

class RejectPaymentDto {
  @IsString()
  @MaxLength(300)
  reason: string;
}

/**
 * Transfers to check (§2.10): customers pay Taladonline's account and send slips; approving
 * sends the order to its shops as paid, rejecting asks the customer for new slips.
 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('payments')
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentReviewService) {}

  /** `?status=review|rejected|approved&page=` */
  @Get()
  list(@Query() q: PaymentQueueQuery) {
    const queue = (PAYMENT_QUEUES as readonly string[]).includes(q.status ?? '') ? (q.status as PaymentQueue) : 'review';
    return this.payments.queue(queue, q.page, q.pageSize);
  }

  @Get('slips/:slipId')
  async slip(@Param('slipId', new ParseUUIDPipe()) slipId: string) {
    const file = await this.payments.slipImage(slipId);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  @Get(':number')
  detail(@Param('number') number: string) {
    return this.payments.detail(number);
  }

  @Post(':number/approve')
  approve(@CurrentAdmin() admin: AdminUser, @Param('number') number: string, @ClientIp() ip: string) {
    return this.payments.approve(admin, number, ip);
  }

  @Post(':number/reject')
  reject(@CurrentAdmin() admin: AdminUser, @Param('number') number: string, @Body() dto: RejectPaymentDto, @ClientIp() ip: string) {
    return this.payments.reject(admin, number, dto.reason, ip);
  }
}

/** Paid orders that were cancelled (out of stock, cancelled by the shop): Taladonline refunds the customer. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('payments')
@Controller('admin/refunds')
export class AdminRefundsController {
  constructor(private readonly payments: PaymentReviewService) {}

  /** `?status=due|done&page=` */
  @Get()
  list(@Query() q: PaymentQueueQuery) {
    const queue = (REFUND_QUEUES as readonly string[]).includes(q.status ?? '') ? (q.status as RefundQueue) : 'due';
    return this.payments.refunds(queue, q.page, q.pageSize);
  }

  /** The QR of the customer's refund account. */
  @Get('accounts/:accountId/qr')
  async qr(@Param('accountId', id) accountId: string) {
    const file = await this.payments.refundQr(accountId);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  @Post(':number/done')
  done(@CurrentAdmin() admin: AdminUser, @Param('number') number: string, @Body() dto: ReferenceDto, @ClientIp() ip: string) {
    return this.payments.markRefunded(admin, number, dto.reference?.trim() || null, ip);
  }
}

class PaymentAccountDto {
  @IsOptional()
  @IsIn([...BANK_CODES, null])
  bankCode: BankCode | null = null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accountName: string | null = null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  accountNumber: string | null = null;
}

/** Taladonline's account customers transfer to (shown at checkout). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('settings')
@Controller('admin/settings/payment-account')
export class AdminPaymentAccountController {
  constructor(private readonly account: PlatformAccountService) {}

  @Get()
  get() {
    return this.account.get();
  }

  @Put()
  save(@CurrentAdmin() admin: AdminUser, @Body() dto: PaymentAccountDto) {
    return this.account.save(admin, {
      bankCode: dto.bankCode ?? null,
      accountName: dto.accountName?.trim() || null,
      accountNumber: dto.accountNumber?.replace(/\s+/g, '') || null,
    });
  }

  @Get('qr')
  async qr() {
    const file = await this.account.qr();
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  /** The receiving QR image (multipart field `file`). */
  @Post('qr')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  uploadQr(@CurrentAdmin() admin: AdminUser, @UploadedFile() file?: Express.Multer.File) {
    return this.account.uploadQr(admin, file);
  }

  @Delete('qr')
  removeQr(@CurrentAdmin() admin: AdminUser) {
    return this.account.removeQr(admin);
  }
}

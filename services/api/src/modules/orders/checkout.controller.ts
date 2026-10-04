import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CHECKOUT_PAYMENT_METHODS, CUSTOMER_LIMITS, type CheckoutPaymentMethod } from '@talad/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import type { StoredObject } from '../media/storage.service.js';
import { CheckoutService } from './checkout.service.js';
import { PaymentSlipsService } from './payment-slips.service.js';

class CheckoutSelectionDto {
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('7', { each: true })
  itemIds: string[];

  /** Courier from the quote's `delivery.options`; omitted = the first option. */
  @IsOptional()
  @IsUUID('7')
  deliveryProviderId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string;
}

class QuoteDto extends CheckoutSelectionDto {
  /** Delivery address for courier zone pricing; omitted = the default address. */
  @IsOptional()
  @IsUUID('7')
  addressId?: string;
}

class PlaceOrderDto extends CheckoutSelectionDto {
  @IsUUID('7')
  addressId: string;

  @IsIn(CHECKOUT_PAYMENT_METHODS)
  paymentMethod: CheckoutPaymentMethod;

  /** The total the customer saw; the order is refused if prices moved since. */
  @IsInt()
  @Min(0)
  expectedTotal: number;

  /** { [shopId]: slipKey } from POST /me/checkout/slips — required for BANK_TRANSFER. */
  @IsOptional()
  @IsObject()
  slips?: Record<string, string>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

const uploadSlip = FileInterceptor('file', { limits: { fileSize: CUSTOMER_LIMITS.qrMaxBytes, files: 1 } });
const image = (file: StoredObject) =>
  new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });

@ApiTags('checkout')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/checkout')
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly slips: PaymentSlipsService,
  ) {}

  @Post('quote')
  @HttpCode(200)
  quote(@CurrentCustomer() c: Customer, @Body() dto: QuoteDto) {
    return this.checkout.quote(c.id, dto);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  place(@CurrentCustomer() c: Customer, @Body() dto: PlaceOrderDto) {
    return this.checkout.place(c.id, dto);
  }

  /** Transfer slip uploaded before placing the order. Multipart field `file`. */
  @Post('slips')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadSlip)
  uploadSlip(@CurrentCustomer() c: Customer, @UploadedFile() file?: Express.Multer.File) {
    return this.slips.uploadCheckoutSlip(c.id, file);
  }

  /** A shop's receiving QR (LAO QR) for manual transfers. */
  @Get('shops/:shopId/payment-qr')
  async shopQr(@Param('shopId', new ParseUUIDPipe({ version: '7' })) shopId: string) {
    return image(await this.slips.shopQr(shopId));
  }

  /** Development only — stands in for the shop confirming the slip. */
  @Post('simulate-payment/:number')
  @HttpCode(200)
  simulatePayment(@CurrentCustomer() c: Customer, @Param('number') number: string) {
    return this.checkout.simulatePayment(c.id, number);
  }
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/orders/:number')
export class OrderPaymentController {
  constructor(private readonly slips: PaymentSlipsService) {}

  @Get('payment-qr')
  async qr(@CurrentCustomer() c: Customer, @Param('number') number: string) {
    return image(await this.slips.orderQr(c.id, number));
  }

  /** Pay later, or replace a wrong slip, while the order still awaits payment. */
  @Post('payment-slip')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadSlip)
  attachSlip(@CurrentCustomer() c: Customer, @Param('number') number: string, @UploadedFile() file?: Express.Multer.File) {
    return this.slips.attachSlip(c.id, number, file);
  }

  @Get('payment-slip')
  async slip(@CurrentCustomer() c: Customer, @Param('number') number: string) {
    return image(await this.slips.slip(c.id, number));
  }
}

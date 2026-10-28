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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CHECKOUT_PAYMENT_METHODS, CUSTOMER_LIMITS, MAX_PAYMENT_SLIPS, type CheckoutPaymentMethod } from '@talad/shared';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
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
import { ShopOrdersService } from './shop-orders.service.js';

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

  /** Shops whose own urgent delivery the customer chose. */
  @IsOptional()
  @ArrayMaxSize(50)
  @IsUUID('7', { each: true })
  urgentShopIds?: string[];

  /** Shops the customer will collect from in person. */
  @IsOptional()
  @ArrayMaxSize(50)
  @IsUUID('7', { each: true })
  pickupShopIds?: string[];

  /** Spend loyalty points on this order (as many as the balance and total allow). */
  @IsOptional()
  @IsBoolean()
  usePoints?: boolean;
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

  /** BANK_TRANSFER: 1–3 slip keys from POST /me/checkout/slips (one transfer for the whole order). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PAYMENT_SLIPS)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  slipKeys?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

const uploadSlip = FileInterceptor('file', { limits: { fileSize: CUSTOMER_LIMITS.qrMaxBytes, files: 1 } });
const uploadSlips = FilesInterceptor('files', MAX_PAYMENT_SLIPS, { limits: { fileSize: CUSTOMER_LIMITS.qrMaxBytes, files: MAX_PAYMENT_SLIPS } });
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

  /** Taladonline's receiving QR (LAO QR) for transfers. */
  @Get('payment-qr')
  async platformQr() {
    return image(await this.slips.platformQr());
  }
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/orders/:number')
export class OrderPaymentController {
  constructor(
    private readonly slips: PaymentSlipsService,
    private readonly shopOrders: ShopOrdersService,
  ) {}

  /** The courier bill photo the shop uploaded when it shipped this order. */
  @Get('shipping-bill')
  async shippingBill(@CurrentCustomer() c: Customer, @Param('number') number: string) {
    return image(await this.shopOrders.bill(null, number, c.id));
  }

  /** The order's slips and whether Taladonline approved or rejected them. */
  @Get('payment-slips')
  slipList(@CurrentCustomer() c: Customer, @Param('number') number: string) {
    return this.slips.slips(c.id, number);
  }

  /** New slips (1–3, multipart field `files`) while the order still awaits payment, e.g. after a rejection. */
  @Post('payment-slips')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadSlips)
  attachSlips(@CurrentCustomer() c: Customer, @Param('number') number: string, @UploadedFiles() files?: Express.Multer.File[]) {
    return this.slips.attachSlips(c.id, number, files);
  }

  @Get('payment-slips/:slipId')
  async slip(@CurrentCustomer() c: Customer, @Param('number') number: string, @Param('slipId', new ParseUUIDPipe()) slipId: string) {
    return image(await this.slips.slipImage(c.id, number, slipId));
  }
}

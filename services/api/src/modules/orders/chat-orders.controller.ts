import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CHECKOUT_PAYMENT_METHODS, CUSTOMER_LIMITS, MAX_CART_QUANTITY, type CheckoutPaymentMethod } from '@talad/shared';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { CHAT_ORDER_LIMITS, ChatOrdersService } from './chat-orders.service.js';

const id = new ParseUUIDPipe({ version: '7' });
const uploadSlip = FileInterceptor('file', { limits: { fileSize: CUSTOMER_LIMITS.qrMaxBytes, files: 1 } });

export class ChatOrderItemDto {
  @IsUUID('7')
  productId: string;

  @IsOptional()
  @IsUUID('7')
  variantId?: string | null;

  @IsInt()
  @Min(1)
  @Max(MAX_CART_QUANTITY)
  quantity: number;
}

export class ChatOrderItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CHAT_ORDER_LIMITS.items)
  @ValidateNested({ each: true })
  @Type(() => ChatOrderItemDto)
  items: ChatOrderItemDto[];
}

class PatchDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CHAT_ORDER_LIMITS.items)
  @ValidateNested({ each: true })
  @Type(() => ChatOrderItemDto)
  items?: ChatOrderItemDto[];

  @IsOptional()
  @IsUUID('7')
  addressId?: string;

  @IsOptional()
  @IsUUID('7')
  deliveryProviderId?: string;

  @IsOptional()
  @IsIn(CHECKOUT_PAYMENT_METHODS)
  paymentMethod?: CheckoutPaymentMethod;

  /** "" removes the coupon; null goes back to the shop's best one. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  couponCode?: string | null;
}

class PlaceDto {
  /** The total the customer saw on the card; refused if prices moved since. */
  @IsInt()
  @Min(0)
  expectedTotal: number;
}

export const toItems = (items: ChatOrderItemDto[]) => items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity }));

/** Buy by chat: the customer's order cards (only theirs). */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/chat-orders')
export class ChatOrdersController {
  constructor(private readonly orders: ChatOrdersService) {}

  @Get(':id')
  view(@CurrentCustomer() c: Customer, @Param('id', id) orderId: string) {
    return this.orders.view(c.id, orderId);
  }

  @Patch(':id')
  update(@CurrentCustomer() c: Customer, @Param('id', id) orderId: string, @Body() dto: PatchDto) {
    return this.orders.update(c.id, orderId, {
      items: dto.items && toItems(dto.items),
      addressId: dto.addressId,
      deliveryProviderId: dto.deliveryProviderId,
      paymentMethod: dto.paymentMethod,
      couponCode: dto.couponCode,
    });
  }

  /** Transfer slip (multipart field `file`). */
  @Post(':id/slip')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadSlip)
  slip(@CurrentCustomer() c: Customer, @Param('id', id) orderId: string, @UploadedFile() file?: Express.Multer.File) {
    return this.orders.attachSlip(c.id, orderId, file);
  }

  @Post(':id/place')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  place(@CurrentCustomer() c: Customer, @Param('id', id) orderId: string, @Body() dto: PlaceDto) {
    return this.orders.place(c.id, orderId, dto.expectedTotal);
  }

  @Post(':id/cancel')
  @HttpCode(204)
  async cancel(@CurrentCustomer() c: Customer, @Param('id', id) orderId: string) {
    await this.orders.cancel({ customerId: c.id }, orderId);
  }
}

import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MAX_CART_QUANTITY } from '@talad/shared';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { CartService } from './cart.service.js';

class AddToCartDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsInt()
  @Min(1)
  @Max(MAX_CART_QUANTITY)
  quantity: number;
}

class SetQuantityDto {
  /** 0 removes the line. */
  @IsInt()
  @Min(0)
  @Max(MAX_CART_QUANTITY)
  quantity: number;
}

const id = new ParseUUIDPipe({ version: '7' });

@ApiTags('cart')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  view(@CurrentCustomer() c: Customer) {
    return this.cart.view(c.id);
  }

  /** Total units, for the header badge. */
  @Get('count')
  count(@CurrentCustomer() c: Customer) {
    return this.cart.count(c.id);
  }

  @Post('items')
  add(@CurrentCustomer() c: Customer, @Body() dto: AddToCartDto) {
    return this.cart.add(c.id, dto.productId, dto.variantId, dto.quantity);
  }

  @Patch('items/:id')
  setQuantity(@CurrentCustomer() c: Customer, @Param('id', id) itemId: string, @Body() dto: SetQuantityDto) {
    return this.cart.setQuantity(c.id, itemId, dto.quantity);
  }

  @Delete('items/:id')
  remove(@CurrentCustomer() c: Customer, @Param('id', id) itemId: string) {
    return this.cart.remove(c.id, itemId);
  }
}

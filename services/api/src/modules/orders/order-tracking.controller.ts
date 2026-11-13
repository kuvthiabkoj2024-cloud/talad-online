import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { OrderTrackingService } from './order-tracking.service.js';

class TrackOrderDto {
  @IsString()
  @MinLength(4)
  @MaxLength(40)
  number: string;

  @IsString()
  @MinLength(6)
  @MaxLength(30)
  phone: string;
}

/** Public order tracking: no sign-in, so it's tightly rate limited. */
@ApiTags('orders')
@Controller('orders/track')
export class OrderTrackingController {
  constructor(private readonly tracking: OrderTrackingService) {}

  /** `{ number, phone }` → where the order is. 404 `ORDER_NOT_FOUND` when they don't match. */
  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  track(@Body() dto: TrackOrderDto) {
    return this.tracking.track(dto.number, dto.phone);
  }
}

import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { CartController } from './cart.controller.js';
import { CartService } from './cart.service.js';

/** Multi-shop cart (§4.4). */
@Module({
  imports: [AuthModule, MediaModule, PromotionsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}

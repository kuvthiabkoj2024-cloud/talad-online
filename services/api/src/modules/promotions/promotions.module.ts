import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AdminPromotionsController, BannersController } from './admin-promotions.controller.js';
import { BannersService } from './banners.service.js';
import { FlashSalePricingService } from './flash-sale-pricing.service.js';
import { ShopCouponsController } from './shop-coupons.controller.js';
import { ShopCouponsService } from './shop-coupons.service.js';
import { ShopFlashSalesController } from './shop-flash-sales.controller.js';
import { ShopFlashSalesService } from './shop-flash-sales.service.js';

/** Coupons, discounts, flash sales and landing-page banners (§2.8, §3.4). */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ShopCouponsController, ShopFlashSalesController, BannersController, AdminPromotionsController],
  providers: [ShopCouponsService, ShopFlashSalesService, FlashSalePricingService, BannersService],
  exports: [FlashSalePricingService],
})
export class PromotionsModule {}

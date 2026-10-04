import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CartModule } from '../cart/cart.module.js';
import { MediaModule } from '../media/media.module.js';
import { CheckoutController, OrderPaymentController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { CustomerOrdersController } from './customer-orders.controller.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { PaymentSlipsService } from './payment-slips.service.js';

/** Checkout, per-shop order splitting, status lifecycle and deadline logic (§3.6, §4.4, §4.5). */
@Module({
  imports: [AuthModule, CartModule, MediaModule],
  // OrderPaymentController (me/orders/:number/…) must be registered before the
  // catch-all GET me/orders/:number of CustomerOrdersController.
  controllers: [OrderPaymentController, CustomerOrdersController, CheckoutController],
  providers: [CustomerOrdersService, CheckoutService, PaymentSlipsService],
})
export class OrdersModule {}

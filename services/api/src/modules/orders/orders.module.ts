import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CartModule } from '../cart/cart.module.js';
import { AdminDisputesController, AdminOrdersController, AdminPayoutsController } from './admin-orders.controller.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { CmsModule } from '../cms/cms.module.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ChatOrdersController } from './chat-orders.controller.js';
import { ChatOrdersService } from './chat-orders.service.js';
import { CheckoutController, OrderPaymentController } from './checkout.controller.js';
import { CheckoutService } from './checkout.service.js';
import { CustomerOrdersController } from './customer-orders.controller.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { OrderDeadlinesService } from './order-deadlines.service.js';
import { PaymentSlipsService } from './payment-slips.service.js';
import { ShopOrdersController } from './shop-orders.controller.js';
import { ShopOrdersService } from './shop-orders.service.js';

/** Checkout, per-shop order splitting, status lifecycle and deadline logic (§3.6, §4.4, §4.5). */
@Module({
  imports: [AuthModule, CartModule, CmsModule, MediaModule, NotificationsModule],
  // OrderPaymentController (me/orders/:number/…) must be registered before the
  // catch-all GET me/orders/:number of CustomerOrdersController.
  controllers: [OrderPaymentController, CustomerOrdersController, CheckoutController, ShopOrdersController, ChatOrdersController, AdminOrdersController, AdminDisputesController, AdminPayoutsController],
  providers: [CustomerOrdersService, CheckoutService, PaymentSlipsService, ShopOrdersService, OrderDeadlinesService, AdminOrdersService, ChatOrdersService],
  exports: [CheckoutService, PaymentSlipsService, ChatOrdersService],
})
export class OrdersModule {}

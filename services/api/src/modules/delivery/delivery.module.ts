import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminDeliveryController } from './admin-delivery.controller.js';
import { AdminDeliveryService } from './admin-delivery.service.js';

/** Delivery providers, shipping zones and tracking (§2.7). */
@Module({
  imports: [AuthModule],
  controllers: [AdminDeliveryController],
  providers: [AdminDeliveryService],
})
export class DeliveryModule {}

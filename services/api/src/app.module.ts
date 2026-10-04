import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AdminsModule } from './modules/admins/admins.module.js';
import { ShopsModule } from './modules/shops/shops.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { DeliveryModule } from './modules/delivery/delivery.module.js';
import { PromotionsModule } from './modules/promotions/promotions.module.js';
import { LoyaltyModule } from './modules/loyalty/loyalty.module.js';
import { MediaModule } from './modules/media/media.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { CmsModule } from './modules/cms/cms.module.js';
import { DisputesModule } from './modules/disputes/disputes.module.js';
import { AuditModule } from './modules/audit/audit.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    HealthModule,
    AuthModule,
    AdminsModule,
    ShopsModule,
    CustomersModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    PaymentsModule,
    DeliveryModule,
    PromotionsModule,
    LoyaltyModule,
    MediaModule,
    NotificationsModule,
    ReviewsModule,
    ReportsModule,
    CmsModule,
    DisputesModule,
    AuditModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

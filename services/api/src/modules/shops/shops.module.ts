import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminShopsController } from './admin-shops.controller.js';
import { AdminShopsService } from './admin-shops.service.js';
import { ShopApplicationController } from './shop-application.controller.js';
import { ShopApplicationService } from './shop-application.service.js';
import { ShopCustomersController } from './shop-customers.controller.js';
import { ShopCustomersService } from './shop-customers.service.js';
import { MyFollowsController, ShopFollowersController } from './shop-follows.controller.js';
import { ShopFollowsService } from './shop-follows.service.js';
import { ShopProfileController } from './shop-profile.controller.js';
import { ShopProfileService } from './shop-profile.service.js';
import { MyShopController, ShopsController, ShopSummaryController } from './shops.controller.js';
import { ShopsService } from './shops.service.js';

/** Shop registration, KYC, approval/suspension, profile and commission overrides (§2.3, §3.2). */
@Module({
  imports: [AuthModule, CatalogModule, MediaModule, NotificationsModule],
  controllers: [
    AdminShopsController,
    ShopApplicationController,
    ShopSummaryController,
    ShopProfileController,
    ShopCustomersController,
    ShopFollowersController,
    MyFollowsController,
    MyShopController,
    ShopsController,
  ],
  providers: [ShopsService, ShopApplicationService, ShopProfileService, ShopCustomersService, ShopFollowsService, AdminShopsService],
})
export class ShopsModule {}

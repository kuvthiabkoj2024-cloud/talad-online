import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PromotionsModule } from '../promotions/promotions.module.js';
import { AdminProductsController } from './products/admin-products.controller.js';
import { AdminProductsService } from './products/admin-products.service.js';
import { AdminCatalogController } from './admin-catalog.controller.js';
import { AdminCatalogService } from './admin-catalog.service.js';
import { CategoriesController } from './categories/categories.controller.js';
import { CategoriesService } from './categories/categories.service.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsService } from './products/products.service.js';
import { ShopProductsController } from './products/shop-products.controller.js';
import { ShopProductsService } from './products/shop-products.service.js';
import { UnitsController } from './units.controller.js';

/** Categories, units, products, variants and moderation (§2.5, §2.6, §3.3). */
@Module({
  imports: [AuthModule, MediaModule, PromotionsModule, NotificationsModule],
  controllers: [CategoriesController, UnitsController, ProductsController, ShopProductsController, AdminProductsController, AdminCatalogController],
  providers: [CategoriesService, ProductsService, ShopProductsService, AdminProductsService, AdminCatalogService],
  exports: [CategoriesService, ProductsService],
})
export class CatalogModule {}

import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { CategoriesController } from './categories/categories.controller.js';
import { CategoriesService } from './categories/categories.service.js';
import { ProductsController } from './products/products.controller.js';
import { ProductsService } from './products/products.service.js';

/** Categories, units, products, variants and moderation (§2.5, §2.6, §3.3). */
@Module({
  imports: [MediaModule],
  controllers: [CategoriesController, ProductsController],
  providers: [CategoriesService, ProductsService],
  exports: [CategoriesService, ProductsService],
})
export class CatalogModule {}

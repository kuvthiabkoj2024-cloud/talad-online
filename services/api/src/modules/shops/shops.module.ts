import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { CatalogModule } from '../catalog/catalog.module.js';
import { MediaModule } from '../media/media.module.js';
import { MyShopController, ShopsController } from './shops.controller.js';
import { ShopsService } from './shops.service.js';

/** Shop registration, KYC, approval/suspension, profile and commission overrides (§2.3, §3.2). */
@Module({
  imports: [AuthModule, CatalogModule, MediaModule],
  controllers: [MyShopController, ShopsController],
  providers: [ShopsService],
})
export class ShopsModule {}

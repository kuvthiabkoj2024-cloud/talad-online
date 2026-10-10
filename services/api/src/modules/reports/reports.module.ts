import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AdminDashboardController, AdminReportsController } from './admin-reports.controller.js';
import { AdminReportsService } from './admin-reports.service.js';
import { ShopReportsController } from './shop-reports.controller.js';
import { ShopReportsService } from './shop-reports.service.js';

/** Dashboards and exportable sales/financial reports for admin and shops (§2.2, §2.9, §3.7). */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ShopReportsController, AdminDashboardController, AdminReportsController],
  providers: [ShopReportsService, AdminReportsService],
})
export class ReportsModule {}

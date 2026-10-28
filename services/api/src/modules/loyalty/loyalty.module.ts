import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MyPointsController } from './points.controller.js';
import { PointsService } from './points.service.js';

/** Point earn/redeem rules, balances and expiry (§2.4, §4.6). Spending happens at checkout. */
@Module({
  imports: [AuthModule],
  controllers: [MyPointsController],
  providers: [PointsService],
})
export class LoyaltyModule {}

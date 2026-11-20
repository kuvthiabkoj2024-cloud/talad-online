import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MediaModule } from '../media/media.module.js';
import { ShopReviewsController } from './shop-reviews.controller.js';
import { ShopReviewsService } from './shop-reviews.service.js';

/** Product and shop reviews with shop replies (§3.8). */
@Module({
  imports: [AuthModule, MediaModule, NotificationsModule],
  controllers: [ShopReviewsController],
  providers: [ShopReviewsService],
})
export class ReviewsModule {}

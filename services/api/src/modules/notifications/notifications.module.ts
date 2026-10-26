import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AdminAnnouncementsController, AnnouncementsService } from './announcements.js';
import { AdminNotificationsController, NotificationsController, ShopNotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { CustomerPushController, PushConfigController, ShopPushController } from './push.controller.js';
import { PushService } from './push.service.js';

/**
 * Push, email and SMS notifications and announcements (§2.11, §4.7). In-app inbox, plus Web Push
 * to subscribed browsers and PWAs (push.service.ts).
 */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [NotificationsController, ShopNotificationsController, AdminNotificationsController, AdminAnnouncementsController, PushConfigController, CustomerPushController, ShopPushController],
  providers: [NotificationsService, AnnouncementsService, PushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

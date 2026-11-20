import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MediaModule } from '../media/media.module.js';
import { AdminBroadcastsController } from './broadcasts/broadcasts.controller.js';
import { BroadcastsService } from './broadcasts/broadcasts.service.js';
import { ExpoPushService } from './expo-push.service.js';
import { NotificationSettingsController, PhonePushService, PushDevicesController } from './phone-push.controller.js';
import { AdminNotificationsController, NotificationsController, ShopNotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { CustomerPushController, PushConfigController, ShopPushController } from './push.controller.js';
import { PushService } from './push.service.js';

/**
 * Push, email and SMS notifications and announcements (§2.11, §4.7). In-app inbox, plus Web Push
 * to subscribed browsers and PWAs (push.service.ts) and push to the phone app through Expo
 * (expo-push.service.ts); admin broadcasts send and schedule messages (broadcasts/).
 */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [NotificationsController, ShopNotificationsController, AdminNotificationsController, PushConfigController, CustomerPushController, ShopPushController, PushDevicesController, NotificationSettingsController, AdminBroadcastsController],
  providers: [NotificationsService, PushService, ExpoPushService, PhonePushService, BroadcastsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

import { Module } from '@nestjs/common';
import { AdminMediaService } from './admin-media.service.js';
import { MediaService } from './media.service.js';
import { StorageService } from './storage.service.js';

/** Image/video uploads to Bunny storage + CDN and transcoding (§6). */
@Module({
  providers: [MediaService, StorageService, AdminMediaService],
  exports: [MediaService, StorageService, AdminMediaService],
})
export class MediaModule {}

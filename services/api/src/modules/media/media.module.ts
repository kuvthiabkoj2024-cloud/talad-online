import { Module } from '@nestjs/common';
import { MediaService } from './media.service.js';
import { StorageService } from './storage.service.js';

/** Image/video uploads to Bunny storage + CDN and transcoding (§6). */
@Module({
  providers: [MediaService, StorageService],
  exports: [MediaService, StorageService],
})
export class MediaModule {}

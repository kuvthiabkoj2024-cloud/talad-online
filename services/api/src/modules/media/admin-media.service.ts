import { BadRequestException, Injectable } from '@nestjs/common';
import { MEDIA_LIMITS } from '@talad/shared';
import { randomUUID } from 'node:crypto';
import { detectImage } from './image-type.js';
import { MediaService } from './media.service.js';
import { filePrefix, storageFolder } from './storage-keys.js';
import { StorageService } from './storage.service.js';

/** Platform-owned public images uploaded from the admin console. */
@Injectable()
export class AdminMediaService {
  constructor(
    private readonly storage: StorageService,
    private readonly media: MediaService,
  ) {}

  async uploadImage(file: Express.Multer.File | undefined) {
    if (!file) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'No file uploaded' });
    if (file.size > MEDIA_LIMITS.maxImageBytes) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Image must be 5 MB or smaller' });
    const type = detectImage(file.buffer);
    if (!type) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Upload a PNG, JPG or WebP image' });
    const key = `${filePrefix(storageFolder.platformMedia(), 'image')}${randomUUID()}.${type.ext}`;
    await this.storage.put(key, file.buffer, type.type);
    return { key, url: this.media.publicUrl(key) };
  }
}

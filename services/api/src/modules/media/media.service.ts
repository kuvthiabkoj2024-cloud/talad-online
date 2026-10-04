import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';

@Injectable()
export class MediaService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Public URL for a stored media key; absolute URLs (e.g. demo images) pass through. */
  publicUrl(key: string): string {
    if (/^https?:\/\//.test(key)) return key;
    const base = this.config.get('BUNNY_CDN_HOST', { infer: true });
    return base ? `${base.replace(/\/$/, '')}/${key}` : key;
  }
}

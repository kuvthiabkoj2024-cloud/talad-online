import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import type { Env } from '../../config/env.validation.js';

export interface StoredObject {
  body: Readable;
  contentType: string;
  contentLength?: number;
}

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
};

/** Keys are built by storage-keys.ts; refuse anything that could escape the zone. */
const SAFE_KEY = /^[a-z]-[0-9a-f-]{36}\/[a-z]+\/[a-z0-9-]+\.[a-z0-9]+$/;

/**
 * File storage on a Bunny storage zone (layout in storage-keys.ts). Private files
 * (slips, QR codes) are read back through the Storage API and streamed by the
 * caller after its own access checks; public media is served by the pull zone
 * (MediaService.publicUrl).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  /** https://<region>.storage.bunnycdn.com/<zone> */
  private readonly baseUrl: string | null;
  private readonly accessKey: string;

  constructor(config: ConfigService<Env, true>) {
    const zone = config.get('BUNNY_STORAGE_ZONE', { infer: true });
    this.accessKey = config.get('BUNNY_API_KEY', { infer: true }) ?? '';
    const host = (config.get('BUNNY_BASE_HOSTNAME', { infer: true }) ?? 'storage.bunnycdn.com')
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
    this.baseUrl = zone && this.accessKey ? `https://${host}/${zone}` : null;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const res = await this.request('PUT', key, {
      body: new Uint8Array(body),
      headers: {
        'Content-Type': contentType,
        // Bunny rejects the upload if the stored bytes don't match.
        Checksum: createHash('sha256').update(body).digest('hex').toUpperCase(),
      },
    });
    if (!res.ok) {
      this.logger.error(`Upload of ${key} failed: HTTP ${res.status}`);
      throw new ServiceUnavailableException('Could not store the file');
    }
  }

  async get(key: string): Promise<StoredObject> {
    const res = await this.request('GET', key);
    if (res.status === 404) throw new NotFoundException();
    if (!res.ok || !res.body) {
      this.logger.error(`Download of ${key} failed: HTTP ${res.status}`);
      throw new ServiceUnavailableException('Could not read the file');
    }
    const length = Number(res.headers.get('content-length'));
    return {
      body: Readable.fromWeb(res.body as ReadableStream<Uint8Array>),
      contentType: CONTENT_TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream',
      contentLength: Number.isFinite(length) && length > 0 ? length : undefined,
    };
  }

  /** Best effort: a leftover object is harmless, a failed request shouldn't break the caller. */
  async remove(key: string): Promise<void> {
    try {
      const res = await this.request('DELETE', key);
      if (!res.ok && res.status !== 404) this.logger.warn(`Could not delete ${key}: HTTP ${res.status}`);
    } catch (e) {
      this.logger.warn(`Could not delete ${key}: ${(e as Error).message}`);
    }
  }

  private request(method: 'PUT' | 'GET' | 'DELETE', key: string, init: RequestInit = {}): Promise<Response> {
    if (!this.baseUrl) throw new ServiceUnavailableException('File storage is not configured');
    // Keys from before the Bunny move (or anything malformed) simply don't exist here.
    if (!SAFE_KEY.test(key)) throw new NotFoundException();
    const headers = new Headers(init.headers);
    headers.set('AccessKey', this.accessKey);
    return fetch(`${this.baseUrl}/${key}`, { ...init, method, headers, signal: AbortSignal.timeout(30_000) });
  }
}

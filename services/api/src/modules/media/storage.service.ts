import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
  mov: 'video/quicktime',
  webm: 'video/webm',
  pdf: 'application/pdf',
};

/**
 * Uploads get time in proportion to their size (at least 30 s, assuming ≥ 256 KB/s to the
 * storage region), so a large video on a slow link isn't cut off halfway.
 */
const uploadTimeout = (bytes: number) => Math.max(30_000, Math.ceil(bytes / (256 * 1024)) * 1000);

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
    const sha256 = createHash('sha256').update(body).digest('hex');
    await this.upload(key, contentType, body.length, sha256, { body: new Uint8Array(body) });
  }

  /** Uploads a file from disk without loading it into memory (large videos). */
  async putFile(key: string, path: string, contentType: string): Promise<void> {
    const hash = createHash('sha256');
    await pipeline(createReadStream(path), hash);
    const { size } = await stat(path);
    await this.upload(key, contentType, size, hash.digest('hex'), {
      body: Readable.toWeb(createReadStream(path)) as unknown as BodyInit,
      duplex: 'half',
    });
  }

  private async upload(
    key: string,
    contentType: string,
    size: number,
    sha256: string,
    init: { body: BodyInit; duplex?: 'half' },
  ): Promise<void> {
    let res: Response;
    try {
      res = await this.request(
        'PUT',
        key,
        {
          ...init,
          headers: {
            'Content-Type': contentType,
            'Content-Length': String(size),
            // Bunny rejects the upload if the stored bytes don't match.
            Checksum: sha256.toUpperCase(),
          },
        },
        uploadTimeout(size),
      );
    } catch (e) {
      if (e instanceof NotFoundException || e instanceof ServiceUnavailableException) throw e;
      // Timeout or network failure: a clear 503 rather than an unhandled 500.
      this.logger.error(`Upload of ${key} (${size} bytes) failed: ${(e as Error).message}`);
      throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Could not store the file' });
    }
    if (!res.ok) {
      this.logger.error(`Upload of ${key} failed: HTTP ${res.status}`);
      throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Could not store the file' });
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

  private request(
    method: 'PUT' | 'GET' | 'DELETE',
    key: string,
    init: RequestInit & { duplex?: 'half' } = {},
    timeoutMs = 30_000,
  ): Promise<Response> {
    if (!this.baseUrl) throw new ServiceUnavailableException('File storage is not configured');
    // Keys from before the Bunny move (or anything malformed) simply don't exist here.
    if (!SAFE_KEY.test(key)) throw new NotFoundException();
    const headers = new Headers(init.headers);
    headers.set('AccessKey', this.accessKey);
    return fetch(`${this.baseUrl}/${key}`, { ...init, method, headers, signal: AbortSignal.timeout(timeoutMs) });
  }
}

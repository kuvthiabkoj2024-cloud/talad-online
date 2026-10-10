import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { StorageEngine } from 'multer';

/**
 * Multer storage that streams an upload to a temp file instead of memory, for large
 * files (product videos). Whoever handles the file must delete `file.path` afterwards.
 */
export const tempFileStorage: StorageEngine = {
  _handleFile(_req, file, cb) {
    const path = join(tmpdir(), `talad-upload-${randomUUID()}`);
    let size = 0;
    file.stream.on('data', (chunk: Buffer) => (size += chunk.length));
    pipeline(file.stream, createWriteStream(path)).then(
      () => cb(null, { path, size }),
      (err: Error) => void unlink(path).finally(() => cb(err)),
    );
  },
  // Called by multer when a request fails part-way (e.g. over the size limit).
  _removeFile(_req, file, cb) {
    void unlink(file.path).finally(() => cb(null));
  },
};

/** Deletes a temp upload; it may already be gone. */
export const discardTempFile = (path: string | undefined) => (path ? unlink(path).catch(() => {}) : Promise.resolve());

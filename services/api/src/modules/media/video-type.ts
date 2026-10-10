/**
 * MP4 / QuickTime / WebM detected from the bytes themselves, or null, so an upload's
 * declared content type can't be spoofed.
 */
export function detectVideo(buffer: Buffer): { type: string; ext: string } | null {
  // ISO base media (MP4, MOV): a size field, then "ftyp" and the major brand.
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return buffer.toString('ascii', 8, 12) === 'qt  '
      ? { type: 'video/quicktime', ext: 'mov' }
      : { type: 'video/mp4', ext: 'mp4' };
  }
  // Matroska / WebM: EBML header.
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x1a45dfa3) return { type: 'video/webm', ext: 'webm' };
  return null;
}

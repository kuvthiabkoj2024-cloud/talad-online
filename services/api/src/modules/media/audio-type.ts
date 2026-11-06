/**
 * Voice-message audio detected from the bytes themselves, or null, so an upload's declared
 * content type can't be spoofed. Browsers record WebM/Opus (Chrome, Firefox, Android) or
 * MP4/AAC (Safari, iPhone); phones may also send Ogg, MP3 or WAV.
 */
export function detectAudio(buffer: Buffer): { type: string; ext: string } | null {
  if (buffer.length < 12) return null;
  // Matroska / WebM: EBML header.
  if (buffer.readUInt32BE(0) === 0x1a45dfa3) return { type: 'audio/webm', ext: 'webm' };
  // ISO base media (MP4 / M4A): a size field, then "ftyp".
  if (buffer.toString('ascii', 4, 8) === 'ftyp') return { type: 'audio/mp4', ext: 'm4a' };
  if (buffer.toString('ascii', 0, 4) === 'OggS') return { type: 'audio/ogg', ext: 'ogg' };
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WAVE') return { type: 'audio/wav', ext: 'wav' };
  // MP3: an ID3 tag, or straight into an MPEG audio frame.
  if (buffer.toString('ascii', 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) return { type: 'audio/mpeg', ext: 'mp3' };
  return null;
}

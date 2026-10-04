/** File signatures, so an upload's declared content type can't be spoofed. */
const SIGNATURES: { type: string; ext: string; test: (b: Buffer) => boolean }[] = [
  {
    type: 'image/png',
    ext: 'png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/webp',
    ext: 'webp',
    test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

/** PNG / JPEG / WebP detected from the bytes themselves, or null. */
export function detectImage(buffer: Buffer): { type: string; ext: string } | null {
  const match = SIGNATURES.find((s) => s.test(buffer));
  return match ? { type: match.type, ext: match.ext } : null;
}

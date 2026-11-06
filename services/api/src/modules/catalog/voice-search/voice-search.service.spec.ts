import { describe, expect, it } from 'vitest';
import { wavSamples } from './voice-search.service.js';

function wav({ rate = 16_000, channels = 1, bits = 16, extra = false, samples = 4000 } = {}) {
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(channels, 10);
  fmt.writeUInt32LE(rate, 12);
  fmt.writeUInt32LE(rate * channels * (bits / 8), 16);
  fmt.writeUInt16LE(channels * (bits / 8), 20);
  fmt.writeUInt16LE(bits, 22);
  const pad = extra ? Buffer.concat([Buffer.from('FLLR', 'ascii'), Buffer.from([3, 0, 0, 0]), Buffer.alloc(4)]) : Buffer.alloc(0);
  const data = Buffer.alloc(8 + samples);
  data.write('data', 0, 'ascii');
  data.writeUInt32LE(samples, 4);
  const body = Buffer.concat([Buffer.from('WAVE', 'ascii'), fmt, pad, data]);
  const head = Buffer.alloc(8);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

describe('wavSamples', () => {
  it('reads 16 kHz mono 16-bit PCM', () => {
    expect(wavSamples(wav())?.length).toBe(4000);
  });
  it('skips extra chunks (odd-sized ones are padded)', () => {
    expect(wavSamples(wav({ extra: true }))?.length).toBe(4000);
  });
  it('rejects other formats and junk', () => {
    expect(wavSamples(wav({ rate: 44_100 }))).toBeNull();
    expect(wavSamples(wav({ channels: 2 }))).toBeNull();
    expect(wavSamples(wav({ samples: 100 }))).toBeNull();
    expect(wavSamples(Buffer.from('not audio at all, not audio at all, not audio at all'))).toBeNull();
  });
});

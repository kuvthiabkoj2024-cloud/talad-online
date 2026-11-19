import { brandKey, cleanBrandName } from '@talad/shared';
import { describe, expect, it } from 'vitest';

describe('brand names', () => {
  it('treats case and spacing as the same brand', () => {
    expect(brandKey('  SAMSUNG ')).toBe('samsung');
    expect(brandKey('Samsung')).toBe(brandKey('samsung'));
    expect(brandKey('Xiao   Mi')).toBe('xiao mi');
  });

  it('keeps Lao names and stores them tidied', () => {
    expect(brandKey(' ລາວ  ເບຍ ')).toBe('ລາວ ເບຍ');
    expect(cleanBrandName('  Apple   Inc. ')).toBe('Apple Inc.');
  });

  it('caps the stored name', () => {
    expect(cleanBrandName('x'.repeat(80))).toHaveLength(60);
  });
});

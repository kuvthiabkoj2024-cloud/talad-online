import { toKey } from './admin-catalog.service.js';

describe('toKey', () => {
  it('makes a web address part from an English name', () => {
    expect(toKey('Home & Living', '-', 40)).toBe('home-living');
    expect(toKey('  Café Crème ', '-', 40)).toBe('cafe-creme');
  });

  it('makes a unit code without separators', () => {
    expect(toKey('Kilogram (kg)', '', 10)).toBe('kilogramkg');
    expect(toKey('Box', '', 10)).toBe('box');
  });

  it('is empty for Lao-only names (a fallback is used)', () => {
    expect(toKey('ອາຫານ', '-', 40)).toBe('');
    expect(toKey(undefined, '', 10)).toBe('');
  });
});

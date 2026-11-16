import { dateFormatter, relativeTime, shopOpenState } from '@talad/shared';
import { describe, expect, it } from 'vitest';

describe('Lao dates (no browser Lao data needed)', () => {
  const d = new Date('2026-10-26T06:38:00Z');
  const tz = { timeZone: 'Asia/Vientiane' } as const;
  it('formats day, short month, year and 24-hour time', () => {
    expect(dateFormatter('lo', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...tz }).format(d)).toBe('26 ຕ.ລ. 2026, 13:38');
    expect(dateFormatter('en', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...tz }).format(d)).toBe('26 Oct 2026, 13:38');
  });
  it('uses long month and weekday names', () => {
    expect(dateFormatter('lo', { month: 'long', year: 'numeric', ...tz }).format(d)).toBe('ຕຸລາ 2026');
    expect(dateFormatter('lo', { weekday: 'short', day: 'numeric', month: 'short', ...tz }).format(d)).toBe('ຈັນ 26 ຕ.ລ.');
    expect(dateFormatter('lo', { dateStyle: 'long', ...tz }).format(d)).toBe('26 ຕຸລາ 2026');
  });
  it('says how long ago in Lao', () => {
    expect(relativeTime(-3, 'day', 'lo')).toBe('3 ມື້ກ່ອນ');
    expect(relativeTime(-1, 'day', 'lo')).toBe('ມື້ວານ');
  });
});

describe('shopOpenState', () => {
  const hours = { mon: { open: '08:00', close: '18:00' }, tue: { open: '09:00', close: '17:00' } };
  it('is open during the hours (Vientiane time)', () => {
    expect(shopOpenState(hours, new Date('2026-11-16T03:00:00Z'))).toEqual({ open: true, today: hours.mon, next: null });
  });
  it('says when it opens next', () => {
    expect(shopOpenState(hours, new Date('2026-11-16T00:30:00Z'))?.next).toEqual({ day: 'mon', open: '08:00', today: true });
    expect(shopOpenState(hours, new Date('2026-11-16T12:00:00Z'))?.next).toEqual({ day: 'tue', open: '09:00', today: false });
    expect(shopOpenState(hours, new Date('2026-11-15T03:00:00Z'))?.next).toEqual({ day: 'mon', open: '08:00', today: false });
  });
  it('is null without hours', () => {
    expect(shopOpenState({})).toBeNull();
  });
});

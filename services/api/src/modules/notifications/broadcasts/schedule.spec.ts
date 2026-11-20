import { nextBroadcastRun } from '@talad/shared';
import { describe, expect, it } from 'vitest';

// Vientiane is UTC+7: 09:00 there is 02:00 UTC.
const at = (iso: string) => new Date(iso);

describe('nextBroadcastRun', () => {
  it('sends a ONCE broadcast at its time, then never again', () => {
    const s = { repeat: 'ONCE' as const, startAt: at('2026-11-20T02:00:00Z') };
    expect(nextBroadcastRun(s, at('2026-11-20T01:00:00Z'))).toEqual(at('2026-11-20T02:00:00Z'));
    expect(nextBroadcastRun(s, at('2026-11-20T02:00:00Z'))).toBeNull();
  });

  it('repeats DAILY at the same Vientiane time', () => {
    const s = { repeat: 'DAILY' as const, startAt: at('2026-11-20T02:00:00Z') };
    expect(nextBroadcastRun(s, at('2026-11-19T00:00:00Z'))).toEqual(at('2026-11-20T02:00:00Z'));
    expect(nextBroadcastRun(s, at('2026-11-20T02:00:00Z'))).toEqual(at('2026-11-21T02:00:00Z'));
    expect(nextBroadcastRun(s, at('2026-11-25T10:00:00Z'))).toEqual(at('2026-11-26T02:00:00Z'));
  });

  it('uses the Vientiane date, not the UTC one, near midnight', () => {
    // 06:30 in Vientiane = 23:30 UTC the day before.
    const s = { repeat: 'DAILY' as const, startAt: at('2026-11-19T23:30:00Z') };
    expect(nextBroadcastRun(s, at('2026-11-19T23:30:00Z'))).toEqual(at('2026-11-20T23:30:00Z'));
  });

  it('only sends on the chosen weekdays (Vientiane), WEEKLY', () => {
    // 2026-11-20 is a Friday. Mon(1), Wed(3), Fri(5) at 09:00.
    const s = { repeat: 'WEEKLY' as const, startAt: at('2026-11-20T02:00:00Z'), weekdays: [1, 3, 5] };
    expect(nextBroadcastRun(s, at('2026-11-20T00:00:00Z'))).toEqual(at('2026-11-20T02:00:00Z')); // Fri
    expect(nextBroadcastRun(s, at('2026-11-20T02:00:00Z'))).toEqual(at('2026-11-23T02:00:00Z')); // Mon
    expect(nextBroadcastRun(s, at('2026-11-23T02:00:00Z'))).toEqual(at('2026-11-25T02:00:00Z')); // Wed
  });

  it('stops after the end date', () => {
    const s = { repeat: 'DAILY' as const, startAt: at('2026-11-20T02:00:00Z'), endAt: at('2026-11-21T16:59:00Z') };
    expect(nextBroadcastRun(s, at('2026-11-20T02:00:00Z'))).toEqual(at('2026-11-21T02:00:00Z'));
    expect(nextBroadcastRun(s, at('2026-11-21T02:00:00Z'))).toBeNull();
  });

  it('gives up when no weekday is chosen', () => {
    expect(nextBroadcastRun({ repeat: 'WEEKLY', startAt: at('2026-11-20T02:00:00Z'), weekdays: [] }, at('2026-11-19T00:00:00Z'))).toBeNull();
  });
});

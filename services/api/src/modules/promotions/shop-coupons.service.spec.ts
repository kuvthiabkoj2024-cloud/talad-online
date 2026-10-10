import { couponState } from './shop-coupons.service.js';

const now = new Date('2026-10-07T12:00:00Z');
const coupon = (over: Partial<Parameters<typeof couponState>[0]> = {}) => ({
  isActive: true,
  startsAt: new Date('2026-10-01T00:00:00Z'),
  endsAt: new Date('2026-11-01T00:00:00Z'),
  usedCount: 0,
  usageLimit: null as number | null,
  ...over,
});

describe('couponState', () => {
  it('is active inside its dates', () => {
    expect(couponState(coupon(), now)).toBe('ACTIVE');
  });

  it('is scheduled before it starts and ended after it ends', () => {
    expect(couponState(coupon({ startsAt: new Date('2026-10-08T00:00:00Z') }), now)).toBe('SCHEDULED');
    expect(couponState(coupon({ endsAt: new Date('2026-10-07T11:59:59Z') }), now)).toBe('EXPIRED');
  });

  it('is used up once the total limit is reached', () => {
    expect(couponState(coupon({ usageLimit: 5, usedCount: 5 }), now)).toBe('USED_UP');
    expect(couponState(coupon({ usageLimit: 5, usedCount: 4 }), now)).toBe('ACTIVE');
  });

  it('reports a switched-off coupon as inactive whatever its dates', () => {
    expect(couponState(coupon({ isActive: false, endsAt: new Date('2026-01-01T00:00:00Z') }), now)).toBe('INACTIVE');
  });
});

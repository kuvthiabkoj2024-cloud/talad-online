import { allocateDiscount, couponDiscount, couponProblem, itemCommissions, shopNet, type CouponRule } from './checkout-pricing.js';

const now = new Date('2026-10-04T12:00:00Z');
const rule = (over: Partial<CouponRule> = {}): CouponRule => ({
  id: 'c1',
  shopId: null,
  code: 'TALAD10',
  type: 'PERCENTAGE',
  value: 10,
  minOrderAmount: null,
  maxDiscount: null,
  usageLimit: null,
  perCustomer: null,
  usedCount: 0,
  startsAt: new Date('2026-01-01'),
  endsAt: new Date('2027-01-01'),
  isActive: true,
  ...over,
});

describe('couponDiscount', () => {
  it('takes a percentage, capped by maxDiscount', () => {
    expect(couponDiscount(rule(), 199_000)).toBe(19_900);
    expect(couponDiscount(rule({ maxDiscount: 15_000 }), 199_000)).toBe(15_000);
  });

  it('never discounts more than the amount', () => {
    expect(couponDiscount(rule({ type: 'FIXED_AMOUNT', value: 50_000 }), 35_000)).toBe(35_000);
  });
});

describe('couponProblem', () => {
  const ok = { base: 200_000, now, usedByCustomer: 0 };

  it('accepts a valid coupon', () => {
    expect(couponProblem(rule(), ok)).toBeNull();
  });

  it.each([
    [rule({ isActive: false }), ok, 'COUPON_INVALID'],
    [rule({ endsAt: new Date('2026-10-01') }), ok, 'COUPON_EXPIRED'],
    [rule({ startsAt: new Date('2026-11-01') }), ok, 'COUPON_NOT_STARTED'],
    [rule({ shopId: 's1' }), { ...ok, ownShop: true }, 'COUPON_OWN_SHOP'],
    [rule({ usageLimit: 100, usedCount: 100 }), ok, 'COUPON_USED_UP'],
    [rule({ perCustomer: 1 }), { ...ok, usedByCustomer: 1 }, 'COUPON_ALREADY_USED'],
    [rule({ minOrderAmount: 300_000 }), ok, 'COUPON_MIN_ORDER'],
  ])('rejects %#', (r, ctx, code) => {
    expect(couponProblem(r, ctx)).toBe(code);
  });
});

describe('allocateDiscount', () => {
  it('splits by subtotal and always adds up', () => {
    const parts = allocateDiscount(10_000, [
      { id: 'a', subtotal: 100_000 },
      { id: 'b', subtotal: 200_000 },
    ]);
    expect(parts.get('a')).toBe(3_333);
    expect(parts.get('b')).toBe(6_667);
  });

  it('gives a single shop the whole discount', () => {
    expect(allocateDiscount(19_900, [{ id: 'a', subtotal: 199_000 }]).get('a')).toBe(19_900);
  });
});

describe('itemCommissions', () => {
  it('uses each item\'s own rate', () => {
    const c = itemCommissions([{ id: 'a', lineTotal: 100_000, rate: 5 }, { id: 'b', lineTotal: 50_000, rate: 10 }], 0);
    expect(c.get('a')).toBe(5_000);
    expect(c.get('b')).toBe(5_000);
  });

  it('charges on what an item sold for after its share of a shop coupon', () => {
    // ₭30,000 off split 2:1 → a pays on ₭80,000, b on ₭40,000.
    const c = itemCommissions([{ id: 'a', lineTotal: 100_000, rate: 5 }, { id: 'b', lineTotal: 50_000, rate: 10 }], 30_000);
    expect(c.get('a')).toBe(4_000);
    expect(c.get('b')).toBe(4_000);
  });
});

describe('shopNet', () => {
  it('pays the shop back a platform-funded discount', () => {
    // ₭160,000 of goods, ₭16,000 platform coupon → customer pays ₭144,000; 5% fee on ₭160,000.
    expect(shopNet({ total: 144_000, platformDiscount: 16_000, commission: 8_000 })).toBe(152_000);
  });

  it('leaves a shop-funded discount with the shop', () => {
    expect(shopNet({ total: 144_000, platformDiscount: 0, commission: 7_200 })).toBe(136_800);
  });
});

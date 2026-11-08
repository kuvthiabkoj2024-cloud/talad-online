import { distanceKm, geoPoint, parseUrgentDelivery, urgentFee, urgentQuote, type UrgentDelivery } from '@talad/shared';

const settings: UrgentDelivery = {
  enabled: true,
  eta: 'within 2 hours',
  zones: [
    { province: 'VT', districts: [], fee: 20_000 },
    { province: 'VT', districts: ['Xaysettha', 'ຈັນທະບູລີ'], fee: 10_000 },
    { province: 'LP', districts: ['Luang Prabang'], fee: 15_000 },
  ],
  freeRadiusKm: 0,
};

// Patuxay, and two points about 2.6 km and 13 km from it.
const shop = { latitude: 17.9708, longitude: 102.6186 };
const near = { latitude: 17.9500, longitude: 102.6300 };
const far = { latitude: 17.9750, longitude: 102.7420 };

describe('urgent delivery zones', () => {
  it('prices a named district before the whole province', () => {
    expect(urgentFee(settings, { province: 'VT', district: 'Xaysettha' })).toBe(10_000);
    expect(urgentFee(settings, { province: 'VT', district: 'ຈັນທະບູລີ' })).toBe(10_000);
    expect(urgentFee(settings, { province: 'VT', district: 'Sikhottabong' })).toBe(20_000);
  });

  it('matches district names loosely (spacing and case)', () => {
    expect(urgentFee(settings, { province: 'VT', district: ' xay settha ' })).toBe(10_000);
  });

  it('offers nothing outside the zones, or when switched off', () => {
    expect(urgentFee(settings, { province: 'LP', district: 'Nan' })).toBeNull();
    expect(urgentFee(settings, { province: 'CH', district: 'Pakse' })).toBeNull();
    expect(urgentFee({ ...settings, enabled: false }, { province: 'VT', district: 'Xaysettha' })).toBeNull();
    expect(urgentFee(null, { province: 'VT', district: 'Xaysettha' })).toBeNull();
  });

  it('drops malformed stored zones', () => {
    const parsed = parseUrgentDelivery({ enabled: true, eta: 'fast', zones: [{ province: 'XX', districts: [], fee: 1 }, { province: 'VT', districts: [' A ', ''], fee: 5000.4 }] });
    expect(parsed?.zones).toEqual([{ province: 'VT', districts: ['A'], fee: 5000 }]);
  });

  it('reads settings stored before the free radius as never free', () => {
    expect(parseUrgentDelivery({ enabled: true, eta: '', zones: [] })?.freeRadiusKm).toBe(0);
    expect(parseUrgentDelivery({ enabled: true, eta: '', zones: [], freeRadiusKm: 99 })?.freeRadiusKm).toBe(50);
  });
});

describe('free urgent delivery near the shop', () => {
  const free = { ...settings, freeRadiusKm: 5 };

  it('measures straight-line km', () => {
    expect(distanceKm(shop, near)).toBeCloseTo(2.6, 1);
    expect(distanceKm(shop, far)).toBeGreaterThan(12);
  });

  it('is free within the radius, even outside the areas', () => {
    expect(urgentQuote(free, { province: 'VT', district: 'Sikhottabong', location: near }, shop)).toMatchObject({ fee: 0, free: true });
    expect(urgentQuote(free, { province: 'CH', district: 'Nowhere', location: near }, shop)).toMatchObject({ fee: 0, free: true });
  });

  it("charges the area's fee beyond the radius, or without pins", () => {
    expect(urgentQuote(free, { province: 'VT', district: 'Xaysettha', location: far }, shop)).toMatchObject({ fee: 10_000, free: false });
    expect(urgentQuote(free, { province: 'VT', district: 'Xaysettha', location: null }, shop)).toMatchObject({ fee: 10_000, distanceKm: null });
    expect(urgentQuote(free, { province: 'VT', district: 'Xaysettha', location: near }, null)?.fee).toBe(10_000);
    expect(urgentQuote(settings, { province: 'VT', district: 'Xaysettha', location: near }, shop)?.fee).toBe(10_000);
    expect(urgentQuote(free, { province: 'CH', district: 'Pakse', location: far }, shop)).toBeNull();
  });

  it('ignores missing or empty coordinates', () => {
    expect(geoPoint(null, null)).toBeNull();
    expect(geoPoint(0, 0)).toBeNull();
    expect(geoPoint('17.97', '102.61')).toEqual({ latitude: 17.97, longitude: 102.61 });
  });
});

import { parseUrgentDelivery, urgentFee, type UrgentDelivery } from '@talad/shared';

const settings: UrgentDelivery = {
  enabled: true,
  eta: 'within 2 hours',
  zones: [
    { province: 'VT', districts: [], fee: 20_000 },
    { province: 'VT', districts: ['Xaysettha', 'ຈັນທະບູລີ'], fee: 10_000 },
    { province: 'LP', districts: ['Luang Prabang'], fee: 15_000 },
  ],
};

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
});

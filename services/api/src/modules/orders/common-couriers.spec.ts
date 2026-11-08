import { commonCouriers } from './checkout-pricing.js';

const anousith = { id: 'anousith' };
const mixay = { id: 'mixay' };
const hal = { id: 'hal' };
const serving = [anousith, mixay, hal];

describe('couriers for a multi-shop order', () => {
  it('offers every courier when no shop turned any off', () => {
    expect(commonCouriers(serving, ['a', 'b'], new Map())).toEqual(serving);
  });

  it('follows the shop allowing the fewest couriers', () => {
    // Shop A ships only with Anousith; shop B with all of them.
    const disabled = new Map([['a', new Set(['mixay', 'hal'])], ['b', new Set<string>()]]);
    expect(commonCouriers(serving, ['a', 'b'], disabled)).toEqual([anousith]);
    expect(commonCouriers(serving, ['b'], disabled)).toEqual(serving);
  });

  it('offers nothing when the shops share no courier', () => {
    const disabled = new Map([['a', new Set(['mixay', 'hal'])], ['b', new Set(['anousith'])]]);
    expect(commonCouriers(serving, ['a', 'b'], disabled)).toEqual([]);
  });

  it('ignores shops not shipping by courier (pickup or urgent delivery)', () => {
    const disabled = new Map([['a', new Set(['mixay', 'hal'])]]);
    expect(commonCouriers(serving, ['b'], disabled)).toEqual(serving);
  });
});

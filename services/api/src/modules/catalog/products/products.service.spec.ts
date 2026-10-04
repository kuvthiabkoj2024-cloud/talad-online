import { priceRange } from './products.service.js';

describe('priceRange', () => {
  it('uses the product price when there are no variants', () => {
    expect(priceRange(100, [])).toEqual({ price: 100, priceMax: null });
  });

  it('spans the variant prices, falling back to the product price', () => {
    expect(priceRange(100, [250, null, 80])).toEqual({ price: 80, priceMax: 250 });
  });

  it('collapses to a single price when all variants cost the same', () => {
    expect(priceRange(100, [120, 120])).toEqual({ price: 120, priceMax: null });
  });
});

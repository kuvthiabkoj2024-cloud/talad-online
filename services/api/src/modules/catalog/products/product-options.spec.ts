import { productOptions, variantLabel } from './product-options.js';

describe('product options', () => {
  it('keeps the saved order of names and values', () => {
    const saved = [
      { name: 'Colour', values: ['Red', 'Blue'] },
      { name: 'Size', values: ['S', 'M', 'L'] },
    ];
    expect(productOptions(saved, [])).toEqual(saved);
    expect(variantLabel(saved, { Size: 'M', Colour: 'Blue' })).toBe('Blue / M');
  });

  it('works out options from older products’ variants', () => {
    const variants = [{ attributes: { size: 'S' } }, { attributes: { size: 'M' } }, { attributes: { size: 'S' } }];
    expect(productOptions(null, variants)).toEqual([{ name: 'size', values: ['S', 'M'] }]);
    expect(productOptions(null, [])).toEqual([]);
  });
});

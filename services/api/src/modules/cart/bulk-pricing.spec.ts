import { bulkUnitPrice, priceTierProblem, tierFor } from '@talad/shared';
import { priceLines, type CartLine } from './cart.service.js';

const tiers = [
  { minQuantity: 5, price: 110_000 },
  { minQuantity: 10, price: 100_000 },
];

describe('priceTierProblem', () => {
  it('accepts tiers with growing quantities and falling prices', () => {
    expect(priceTierProblem(120_000, tiers)).toBeNull();
    expect(priceTierProblem(120_000, [])).toBeNull();
  });

  it('refuses a tier for a single unit, or out of order', () => {
    expect(priceTierProblem(120_000, [{ minQuantity: 1, price: 100_000 }])).toBe('quantity');
    expect(priceTierProblem(120_000, [tiers[1], tiers[0]])).toBe('quantityOrder');
    expect(priceTierProblem(120_000, [tiers[0], { minQuantity: 5, price: 90_000 }])).toBe('quantityOrder');
  });

  it('needs each price below the product price and the tier before', () => {
    expect(priceTierProblem(120_000, [{ minQuantity: 10, price: 120_000 }])).toBe('price');
    expect(priceTierProblem(120_000, [tiers[0], { minQuantity: 10, price: 115_000 }])).toBe('priceOrder');
  });
});

describe('bulkUnitPrice', () => {
  it('uses the biggest tier reached', () => {
    expect(tierFor(tiers, 4)).toBeNull();
    expect(bulkUnitPrice(120_000, 120_000, tiers, 1)).toBe(120_000);
    expect(bulkUnitPrice(120_000, 120_000, tiers, 7)).toBe(110_000);
    expect(bulkUnitPrice(120_000, 120_000, tiers, 30)).toBe(100_000);
  });

  it('takes the same share off an option with its own price', () => {
    expect(bulkUnitPrice(120_000, 150_000, tiers, 10)).toBe(125_000);
  });
});

const line = (over: Partial<CartLine> & { pricing?: Partial<CartLine['internal']['pricing']> }): CartLine => {
  const { pricing, ...rest } = over;
  const price = rest.basePrice ?? 120_000;
  return {
    id: 'l1',
    productId: 'p1',
    productSlug: 'shirt',
    variantId: null,
    name: 'Shirt',
    variantLabel: null,
    sku: 'SHIRT',
    imageUrl: null,
    unitPrice: price,
    regularPrice: price,
    basePrice: price,
    bulk: null,
    nextBulk: null,
    compareAtPrice: null,
    quantity: 1,
    stock: 100,
    available: true,
    ownShop: false,
    lineTotal: price * (rest.quantity ?? 1),
    shop: { id: 's1', slug: 'shop', name: 'Shop' },
    internal: {
      pricing: { productPrice: 120_000, compareAtPrice: null, tiers, flashPercent: null, ...pricing },
      commission: null,
      paymentWindowHrs: 24,
      guarantee: null,
      deposit: null,
    },
    ...rest,
  };
};

describe('priceLines', () => {
  it('counts every option of a product towards its tiers', () => {
    const [red, blue] = priceLines([line({ id: 'red', quantity: 6 }), line({ id: 'blue', quantity: 4 })]);
    expect(red).toMatchObject({ unitPrice: 100_000, regularPrice: 100_000, lineTotal: 600_000, bulk: { quantity: 10, minQuantity: 10 }, nextBulk: null });
    expect(blue).toMatchObject({ unitPrice: 100_000, lineTotal: 400_000 });
  });

  it('tells the buyer about the next tier', () => {
    const [l] = priceLines([line({ quantity: 3 })]);
    expect(l).toMatchObject({ unitPrice: 120_000, bulk: null, nextBulk: { minQuantity: 5, unitPrice: 110_000, more: 2 } });
  });

  it("leaves out lines that can't be bought", () => {
    const [, gone] = priceLines([line({ id: 'a', quantity: 6 }), line({ id: 'b', quantity: 4, available: false })]);
    expect(gone).toMatchObject({ unitPrice: 110_000, bulk: { quantity: 6, minQuantity: 5 } });
  });

  it('takes a flash sale off the bulk price', () => {
    const [l] = priceLines([line({ quantity: 10, pricing: { flashPercent: 10 } })]);
    expect(l).toMatchObject({ unitPrice: 90_000, regularPrice: 100_000, compareAtPrice: 100_000, lineTotal: 900_000 });
  });

  it('keeps lines without tiers as they are', () => {
    const plain = line({ quantity: 20, pricing: { tiers: [] } });
    expect(priceLines([plain])[0]).toBe(plain);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { CartService } from './cart.service.js';

/** The badge counts cart lines (each product/option once), not units — on every endpoint alike. */
describe('cart count', () => {
  it('is the number of lines in the cart view, the same as GET /me/cart/count', async () => {
    const service = new CartService(
      {
        cartItem: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(3) },
        shopCustomerNote: { findMany: vi.fn().mockResolvedValue([]) },
      } as never,
      {} as never,
      { discounts: vi.fn().mockResolvedValue(new Map()) } as never,
    );
    // Three lines: 3 units, 2 units and 2 units.
    vi.spyOn(service, 'lines').mockResolvedValue([3, 2, 2].map((quantity, i) => ({ id: `l${i}`, quantity, shop: { id: 's' } })) as never);
    expect((await service.view('c')).count).toBe(3);
    expect((await service.count('c')).count).toBe(3);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { ProductsService } from './products.service.js';

function setup() {
  const prisma = {
    product: { findMany: vi.fn().mockResolvedValue([]) },
    feedPost: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const flash = { discounts: vi.fn().mockResolvedValue(new Map()) };
  return { prisma, service: new ProductsService(prisma as never, {} as never, flash as never) };
}

describe('feed tabs', () => {
  it('reads only product videos for the shop tab', async () => {
    const { prisma, service } = setup();
    await service.feed({ type: 'shop', limit: 8 });
    expect(prisma.product.findMany).toHaveBeenCalledOnce();
    expect(prisma.feedPost.findMany).not.toHaveBeenCalled();
  });

  it("reads only customers' posts for the customer tab", async () => {
    const { prisma, service } = setup();
    await service.feed({ type: 'customer', limit: 8 });
    expect(prisma.feedPost.findMany).toHaveBeenCalledOnce();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('reads both when no type is given', async () => {
    const { prisma, service } = setup();
    await service.feed({ limit: 8 });
    expect(prisma.product.findMany).toHaveBeenCalledOnce();
    expect(prisma.feedPost.findMany).toHaveBeenCalledOnce();
  });
});

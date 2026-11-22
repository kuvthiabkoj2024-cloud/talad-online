import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import type { BrandsService } from '../brands/brands.service.js';
import { ShopProductsService } from './shop-products.service.js';

function setup(brandId: string | null) {
  const prisma = {
    product: { updateMany: vi.fn().mockResolvedValue({ count: 2 }) },
    brand: { findUnique: vi.fn().mockResolvedValue({ name: 'Samsung' }) },
  };
  const brands = { resolve: vi.fn().mockResolvedValue(brandId) };
  const service = new ShopProductsService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    brands as unknown as BrandsService,
  );
  return { prisma, brands, service };
}

describe('ShopProductsService.setBrand', () => {
  it('only changes this shop’s own products, once each', async () => {
    const { prisma, service } = setup('brand-1');
    const out = await service.setBrand('shop-1', ['p1', 'p2', 'p1'], 'samsung');
    expect(prisma.product.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['p1', 'p2'] }, shopId: 'shop-1' }, data: { brandId: 'brand-1' } });
    expect(out).toEqual({ updated: 2, brand: 'Samsung' });
  });

  it('removes the brand when none is given, without touching the status', async () => {
    const { prisma, service } = setup(null);
    const out = await service.setBrand('shop-1', ['p1'], '');
    expect(prisma.product.updateMany.mock.calls[0][0].data).toEqual({ brandId: null });
    expect(prisma.brand.findUnique).not.toHaveBeenCalled();
    expect(out.brand).toBeNull();
  });
});

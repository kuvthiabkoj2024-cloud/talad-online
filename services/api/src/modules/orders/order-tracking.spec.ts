import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { OrderTrackingService } from './order-tracking.service.js';

const ROW = {
  number: 'TL2611130000001',
  status: 'SHIPPED',
  createdAt: new Date('2026-11-10T08:00:00Z'),
  pickup: false,
  urgentDelivery: false,
  trackingNumber: 'HAL123',
  autoConfirmAt: new Date('2026-11-20T08:00:00Z'),
  order: {
    shippingAddress: { recipientName: 'Noy', phone: '+8562055551234', province: 'VT', district: 'Sisattanak', line: 'House 12' },
    customer: { phone: '+8562099990000' },
  },
  shop: { slug: 'demo', name: 'Demo', logoUrl: null },
  deliveryProvider: { name: 'HAL' },
  items: [{ name: 'Shirt', quantity: 2, variant: { attributes: { Size: 'L' } }, product: { images: [] } }],
  history: [
    { toStatus: 'PENDING', createdAt: new Date('2026-11-10T08:00:00Z') },
    { toStatus: 'SHIPPED', createdAt: new Date('2026-11-11T08:00:00Z') },
  ],
};

const service = (row: unknown = ROW) => {
  const prisma = { shopOrder: { findUnique: vi.fn().mockResolvedValue(row) } };
  return { prisma, tracking: new OrderTrackingService(prisma as never, { publicUrl: (k: string) => `/m/${k}` } as never) };
};

describe('order tracking', () => {
  it("finds the order with the delivery address's phone, in any common form", async () => {
    const { tracking, prisma } = service();
    const res = await tracking.track(' tl2611130000001 ', '020 5555 1234');
    expect(prisma.shopOrder.findUnique.mock.calls[0][0].where).toEqual({ number: 'TL2611130000001' });
    expect(res).toMatchObject({ status: 'SHIPPED', deliveryProvider: 'HAL', trackingNumber: 'HAL123', items: [{ name: 'Shirt', variant: 'L', quantity: 2 }] });
    expect(res.history.map((h) => h.status)).toEqual(['PENDING', 'SHIPPED']);
  });

  it("also finds it with the buyer's own phone", async () => {
    await expect(service().tracking.track('TL2611130000001', '+856 20 9999 0000')).resolves.toMatchObject({ number: 'TL2611130000001' });
  });

  it('shows where it goes only roughly: no name, street or phone', async () => {
    const res = await service().tracking.track('TL2611130000001', '2055551234');
    expect(res.destination).toEqual({ province: 'VT', district: 'Sisattanak' });
    expect(JSON.stringify(res)).not.toMatch(/Noy|House 12|5555/);
  });

  it('answers a wrong phone exactly like a wrong number', async () => {
    const wrongPhone = await service().tracking.track('TL2611130000001', '2077778888').catch((e: unknown) => e);
    const noOrder = await service(null).tracking.track('TL0000000000000', '2055551234').catch((e: unknown) => e);
    expect(wrongPhone).toBeInstanceOf(NotFoundException);
    expect((wrongPhone as NotFoundException).getResponse()).toEqual((noOrder as NotFoundException).getResponse());
  });

  it('refuses something that is not a phone number', async () => {
    await expect(service().tracking.track('TL2611130000001', 'abc')).rejects.toBeInstanceOf(NotFoundException);
  });
});

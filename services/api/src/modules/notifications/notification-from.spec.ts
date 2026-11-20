import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

const row = (id: string, type: string, data: object) => ({ id, type, title: 't', body: 'b', data, readAt: null, createdAt: new Date() });

describe('who a notification is from', () => {
  it("shows the order's shop to the customer, MC Mart for broadcasts, and a marked sender as is", async () => {
    const prisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([
          row('1', 'ORDER', { link: '/account/orders/TL-1' }),
          row('2', 'SYSTEM', { broadcastId: 'b1', link: '/feed' }),
          row('3', 'SYSTEM', { actor: { type: 'customer', id: 'c9' }, link: '/u/c9' }),
          row('4', 'SYSTEM', {}),
        ]),
        count: vi.fn().mockResolvedValue(4),
        groupBy: vi.fn().mockResolvedValue([]),
      },
      shopOrder: { findMany: vi.fn().mockResolvedValue([{ number: 'TL-1', shopId: 's1', order: { customerId: 'c1' } }]) },
      shop: { findMany: vi.fn().mockResolvedValue([{ id: 's1', name: 'Kartoon', logoUrl: 'shops/s1/logo.png' }]) },
      customer: { findMany: vi.fn().mockResolvedValue([{ id: 'c9', name: 'Noy', avatarUrl: 'https://lh3.googleusercontent.com/x' }]) },
    };
    const media = { publicUrl: (k: string) => `https://cdn/${k}` };
    const service = new NotificationsService(prisma as never, media as never, {} as never);
    const { items } = await service.list('c1', { page: 1, pageSize: 20 } as never);
    expect(items.map((i) => i.from)).toEqual([
      { kind: 'shop', id: 's1', name: 'Kartoon', imageUrl: 'https://cdn/shops/s1/logo.png' },
      { kind: 'mcmart' },
      { kind: 'customer', id: 'c9', name: 'Noy', avatarUrl: 'https://lh3.googleusercontent.com/x', avatarVersion: null },
      { kind: 'mcmart' },
    ]);
  });
});

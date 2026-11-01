import { describe, expect, it, vi } from 'vitest';
import { AdminVideosService } from './admin-videos.service.js';

const admin = { id: 'admin' } as never;
const setup = (updated = 1) => {
  const tx = {
    feedPost: { findUnique: vi.fn().mockResolvedValue({ customerId: 'c', caption: 'x' }), updateMany: vi.fn().mockResolvedValue({ count: updated }) },
    product: { findFirst: vi.fn().mockResolvedValue({ shopId: 'shop', name: 'Rice basket' }), updateMany: vi.fn().mockResolvedValue({ count: updated }) },
  };
  const prisma = { $transaction: vi.fn((run: (db: typeof tx) => Promise<unknown>) => run(tx)) };
  const notifications = { send: vi.fn(), toShop: vi.fn() };
  const audit = { log: vi.fn() };
  return { tx, notifications, audit, service: new AdminVideosService(prisma as never, {} as never, notifications as never, audit as never) };
};

describe('hiding a video', () => {
  it('hides a customer post, tells them why and logs it', async () => {
    const { service, tx, notifications, audit } = setup();
    await service.setHidden(admin, 'customer', 'p', true, 'Spam');
    expect(tx.feedPost.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'p', isHidden: false }, data: { isHidden: true, hiddenReason: 'Spam' } });
    expect(notifications.send.mock.calls[0][3].en.body).toContain('Spam');
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'video.hide', entityType: 'FeedPost', entityId: 'p' });
  });

  it('hides a shop video and tells the shop', async () => {
    const { service, tx, notifications } = setup();
    await service.setHidden(admin, 'shop', 'x', true, 'Misleading');
    expect(tx.product.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'x', videoHidden: false }, data: { videoHidden: true, videoHiddenReason: 'Misleading' } });
    expect(notifications.toShop).toHaveBeenCalledOnce();
  });

  it('brings one back, clearing the reason', async () => {
    const { service, tx, audit } = setup();
    await service.setHidden(admin, 'customer', 'p', false, null);
    expect(tx.feedPost.updateMany.mock.calls[0][0]).toMatchObject({ where: { isHidden: true }, data: { isHidden: false, hiddenReason: null, hiddenAt: null } });
    expect(audit.log.mock.calls[0][0].action).toBe('video.unhide');
  });

  it("refuses when it's already that way, or the video is gone", async () => {
    const already = setup(0);
    await expect(already.service.setHidden(admin, 'customer', 'p', true, 'x')).rejects.toMatchObject({ status: 409 });
    expect(already.notifications.send).not.toHaveBeenCalled();
    const gone = setup();
    gone.tx.product.findFirst.mockResolvedValue(null);
    await expect(gone.service.setHidden(admin, 'shop', 'x', true, 'x')).rejects.toMatchObject({ status: 404 });
  });
});

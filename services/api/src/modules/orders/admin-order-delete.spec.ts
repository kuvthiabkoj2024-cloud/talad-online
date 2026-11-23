import { Prisma } from '../../generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AuditService } from '../audit/audit.service.js';
import { AdminOrdersService } from './admin-orders.service.js';
import { settleableOrders } from './order-transitions.js';

const admin = { id: 'admin-1' } as never;

function setup(order: { payoutId: string | null } | null) {
  const tx = { $executeRaw: vi.fn().mockResolvedValue(1) };
  const prisma = {
    shopOrder: {
      findFirst: vi.fn().mockResolvedValue(order && { id: 'so-1', status: 'PENDING', total: new Prisma.Decimal(1000), ...order }),
    },
    $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { log: vi.fn() };
  const service = new AdminOrdersService(prisma as unknown as PrismaService, audit as unknown as AuditService, {} as never, {} as never);
  return { prisma, tx, audit, service };
}

describe('AdminOrdersService.deleteOrder (Super Admin soft delete)', () => {
  it('hides the order and records who did it, without removing the row', async () => {
    const { prisma, tx, audit, service } = setup({ payoutId: null });
    await expect(service.deleteOrder(admin, 'TL1', '1.2.3.4')).resolves.toEqual({ deleted: true });
    expect(prisma.shopOrder.findFirst.mock.calls[0][0].where).toEqual({ number: 'TL1', deletedAt: null });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(audit.log.mock.calls[0][0]).toMatchObject({ adminId: 'admin-1', action: 'order.delete', entityId: 'so-1', ip: '1.2.3.4' });
  });

  it('also hides a completed order already paid out to the shop', async () => {
    const { tx, service } = setup({ payoutId: 'payout-1' });
    await expect(service.deleteOrder(admin, 'TL1')).resolves.toEqual({ deleted: true });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('is not found once deleted (or if it never existed)', async () => {
    const { service } = setup(null);
    await expect(service.deleteOrder(admin, 'TL1')).rejects.toThrow('Order not found');
  });

  it('restores a deleted order and records it', async () => {
    const { prisma, tx, audit, service } = setup({ payoutId: null });
    await expect(service.restoreOrder(admin, 'TL1')).resolves.toEqual({ restored: true });
    expect(prisma.shopOrder.findFirst.mock.calls[0][0].where).toEqual({ number: 'TL1', deletedAt: { not: null } });
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(audit.log.mock.calls[0][0]).toMatchObject({ action: 'order.restore', entityId: 'so-1' });
  });

  it('only restores orders that were deleted', async () => {
    const { service } = setup(null);
    await expect(service.restoreOrder(admin, 'TL1')).rejects.toThrow('Deleted order not found');
  });

  it('never pays out a deleted order', () => {
    expect(settleableOrders(new Date()).deletedAt).toBeNull();
  });
});

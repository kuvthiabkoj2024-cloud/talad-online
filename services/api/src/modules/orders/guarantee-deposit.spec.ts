import { DEPOSIT_NOTES, customerGuarantee, depositBlocksShipping, guaranteeEnd, lineDeposit } from '@talad/shared';
import { describe, expect, it, vi } from 'vitest';
import { OrderDeadlinesService } from './order-deadlines.service.js';
import { OrderDepositsService, settleDeposit } from './order-deposits.service.js';

const line = { lineTotal: 100_000, quantity: 2 };

describe('guarantee', () => {
  it('gives the customer double what the shop enters', () => {
    expect(customerGuarantee(6)).toBe(12);
  });

  it('ends after its period, on the last day of a shorter month', () => {
    const start = new Date('2026-01-31T10:00:00Z');
    expect(guaranteeEnd(start, 10, 'DAY').toISOString()).toBe('2026-02-10T10:00:00.000Z');
    expect(guaranteeEnd(start, 1, 'MONTH').toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(guaranteeEnd(start, 2, 'YEAR').toISOString()).toBe('2028-01-31T10:00:00.000Z');
  });
});

describe('deposit', () => {
  it('is a percent of the line, or an amount per unit, never more than the line', () => {
    expect(lineDeposit(line, { type: 'PERCENT', value: 20 })).toBe(20_000);
    expect(lineDeposit(line, { type: 'AMOUNT', value: 10_000 })).toBe(20_000);
    expect(lineDeposit(line, { type: 'AMOUNT', value: 90_000 })).toBe(100_000);
    expect(lineDeposit(line, null)).toBe(0);
  });

  it('holds the order back until it is settled', () => {
    expect(depositBlocksShipping('PENDING')).toBe(true);
    expect(depositBlocksShipping('REJECTED')).toBe(true);
    expect(depositBlocksShipping('CONFIRMED')).toBe(false);
    expect(depositBlocksShipping(null)).toBe(false);
  });

  const row = { id: 'so', number: 'S-1', status: 'CONFIRMED', shopId: 'shop', depositAmount: { toNumber: () => 20_000 }, depositStatus: 'PENDING', depositSlipKey: 'old', shop: { name: 'Shop' }, order: { customerId: 'c' } };
  const fakeTx = (count = 1) => ({
    shopOrder: { updateMany: vi.fn().mockResolvedValue({ count }), findUniqueOrThrow: vi.fn().mockResolvedValue(row) },
    orderStatusHistory: { create: vi.fn() },
  });
  const fakeNotifications = () => ({ send: vi.fn(), toShop: vi.fn(), notifyOrder: vi.fn() });

  describe('when an order falls through', () => {
    it('is owed back for a slip still waiting or confirmed, and both sides are told', async () => {
      const tx = fakeTx();
      const n = fakeNotifications();
      await settleDeposit(tx as never, n as never, 'so', 'RETURN_DUE');
      expect(tx.shopOrder.updateMany.mock.calls[0][0].where.depositStatus).toEqual({ in: ['PENDING', 'CONFIRMED'] });
      expect(tx.shopOrder.updateMany.mock.calls[0][0].data.depositStatus).toBe('RETURN_DUE');
      expect(n.send).toHaveBeenCalledOnce();
      expect(n.toShop).toHaveBeenCalledOnce();
    });

    it('is kept by the shop only if it was confirmed', async () => {
      const tx = fakeTx();
      const n = fakeNotifications();
      await settleDeposit(tx as never, n as never, 'so', 'KEPT');
      expect(tx.shopOrder.updateMany.mock.calls[0][0].where.depositStatus).toBe('CONFIRMED');
      expect(n.toShop).not.toHaveBeenCalled();
    });

    it('needs nothing for a rejected slip, or no deposit', async () => {
      const tx = fakeTx(0);
      const n = fakeNotifications();
      await settleDeposit(tx as never, n as never, 'so', 'RETURN_DUE');
      expect(n.send).not.toHaveBeenCalled();
    });
  });

  describe('reviewed by the shop', () => {
    const shop = { id: 'shop', name: 'Shop' } as never;
    const setup = (status = 'PENDING', updated = 1) => {
      const tx = fakeTx(updated);
      const prisma = {
        shopOrder: { findFirst: vi.fn().mockResolvedValue({ ...row, depositStatus: status }) },
        $transaction: vi.fn((run: (db: unknown) => Promise<unknown>) => run(tx)),
      };
      const storage = { remove: vi.fn() };
      const notifications = fakeNotifications();
      const slips = { uploadCheckoutSlip: vi.fn().mockResolvedValue({ slipKey: 'new' }) };
      return { tx, storage, notifications, slips, service: new OrderDepositsService(prisma as never, storage as never, notifications as never, slips as never) };
    };

    it('needs a reason to reject', async () => {
      await expect(setup().service.reject(shop, 'S-1', '  ')).rejects.toMatchObject({ status: 400 });
    });

    it('is refused if it was already decided', async () => {
      await expect(setup('PENDING', 0).service.confirm(shop, 'S-1')).rejects.toMatchObject({ status: 409 });
    });

    it('takes a new slip only after a rejection, and removes the old file', async () => {
      await expect(setup('PENDING').service.resubmit('c', 'S-1', {} as never)).rejects.toMatchObject({ status: 409 });
      const { service, tx, storage, notifications } = setup('REJECTED');
      await service.resubmit('c', 'S-1', {} as never);
      expect(tx.shopOrder.updateMany.mock.calls[0][0].data).toMatchObject({ depositStatus: 'PENDING', depositSlipKey: 'new', depositRejectReason: null });
      expect(tx.orderStatusHistory.create.mock.calls[0][0].data.note).toBe(DEPOSIT_NOTES.submitted);
      expect(notifications.toShop).toHaveBeenCalledOnce();
      expect(storage.remove).toHaveBeenCalledWith('old');
    });
  });

  it('left unsettled past its time cancels the order and returns the stock', async () => {
    const tx = {
      ...fakeTx(),
      orderItem: { findMany: vi.fn().mockResolvedValue([]) },
      payment: { updateMany: vi.fn() },
      shopOrder: { ...fakeTx().shopOrder, findUnique: vi.fn().mockResolvedValue(null) },
    };
    const prisma = {
      shopOrder: {
        findMany: vi.fn().mockImplementation(({ where }: { where: { status: unknown; depositStatus?: unknown } }) =>
          where.depositStatus ? Promise.resolve([{ id: 'so', number: 'S-1', shop: { name: 'Shop' }, order: { customerId: 'c' }, items: [] }]) : Promise.resolve([]),
        ),
      },
      $transaction: vi.fn((run: (db: unknown) => Promise<unknown>) => run(tx)),
    };
    const notifications = fakeNotifications();
    const deadlines = new OrderDeadlinesService(prisma as never, notifications as never, { get: () => 'test' } as never);
    await expect(deadlines.sweep(new Date())).resolves.toMatchObject({ cancelled: 1 });
    const moved = tx.shopOrder.updateMany.mock.calls[0][0];
    expect(moved.where).toMatchObject({ id: 'so', status: 'CONFIRMED' });
    expect(moved.data).toMatchObject({ status: 'CANCELLED', cancelReason: DEPOSIT_NOTES.expired });
    expect(tx.payment.updateMany).toHaveBeenCalled();
    expect(notifications.notifyOrder).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'CANCELLED', DEPOSIT_NOTES.expired);
  });
});

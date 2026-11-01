import { BILL_REPLACED_NOTE, BILL_REPORTED_NOTE, billCorrectable } from '@talad/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerOrdersService } from './customer-orders.service.js';
import { moveOrder } from './order-transitions.js';
import { ShopOrdersService } from './shop-orders.service.js';

const SHOP_ID = 'shop-1';
const OLD_KEY = `s-${SHOP_ID}/orders/bill-old.jpg`;
const NEW_KEY = `s-${SHOP_ID}/orders/bill-new.jpg`;

/** The database calls these two flows make; `updateMany` says how many rows the guard let through. */
function fakePrisma(row: Record<string, unknown>, updated = 1) {
  const tx = {
    shopOrder: { updateMany: vi.fn().mockResolvedValue({ count: updated }) },
    orderStatusHistory: { create: vi.fn() },
  };
  return {
    tx,
    shopOrder: { findFirst: vi.fn().mockResolvedValue(row) },
    deliveryProvider: { findFirst: vi.fn() },
    $transaction: vi.fn((run: (db: typeof tx) => Promise<unknown>) => run(tx)),
  };
}

describe('wrong courier bill', () => {
  it('can only be corrected while the parcel is on its way', () => {
    expect(billCorrectable('SHIPPED')).toBe(true);
    expect(billCorrectable('DELIVERED')).toBe(true);
    for (const status of ['PENDING', 'CONFIRMED', 'PACKED', 'COMPLETED', 'CANCELLED', 'RETURN_REQUESTED'] as const) expect(billCorrectable(status)).toBe(false);
  });

  it('stops being an error once the order moves on', async () => {
    const tx = { shopOrder: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) }, orderStatusHistory: { create: vi.fn() } };
    await moveOrder(tx as never, 'so-1', 'SHIPPED', 'COMPLETED', {}, { actorType: 'CUSTOMER', actorId: 'c-1' });
    expect(tx.shopOrder.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'COMPLETED', billIssueAt: null });
  });

  describe('the customer reporting it', () => {
    const row = { id: 'so-1', number: 'S-1', status: 'SHIPPED', shopId: SHOP_ID, shippingBillKey: OLD_KEY, billIssueAt: null };
    const notifications = { toShop: vi.fn() };
    const service = (prisma: unknown) => new CustomerOrdersService(prisma as never, {} as never, notifications as never, {} as never);

    beforeEach(() => notifications.toShop.mockClear());

    it('tells the shop and records it on the order', async () => {
      const prisma = fakePrisma(row);
      const { billIssueAt } = await service(prisma).reportBill('c-1', 'S-1');
      expect(prisma.tx.shopOrder.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: 'so-1', billIssueAt: null }, data: { billIssueAt } });
      expect(prisma.tx.orderStatusHistory.create.mock.calls[0][0].data).toMatchObject({ actorType: 'CUSTOMER', note: BILL_REPORTED_NOTE });
      expect(notifications.toShop).toHaveBeenCalledOnce();
    });

    it("doesn't notify the shop twice", async () => {
      const at = new Date('2026-11-01T00:00:00Z');
      const prisma = fakePrisma({ ...row, billIssueAt: at });
      await expect(service(prisma).reportBill('c-1', 'S-1')).resolves.toEqual({ billIssueAt: at });
      expect(prisma.$transaction).not.toHaveBeenCalled();
      // Two tabs at once: the second loses the guarded update.
      const raced = fakePrisma(row, 0);
      await service(raced).reportBill('c-1', 'S-1');
      expect(raced.tx.orderStatusHistory.create).not.toHaveBeenCalled();
      expect(notifications.toShop).not.toHaveBeenCalled();
    });

    it('is refused once the parcel arrived, or without a bill', async () => {
      await expect(service(fakePrisma({ ...row, status: 'COMPLETED' })).reportBill('c-1', 'S-1')).rejects.toMatchObject({ status: 409 });
      await expect(service(fakePrisma({ ...row, shippingBillKey: null })).reportBill('c-1', 'S-1')).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('the shop replacing it', () => {
    const shop = { id: SHOP_ID, name: 'Shop' } as never;
    const row = { id: 'so-1', number: 'S-1', status: 'SHIPPED', shippingBillKey: OLD_KEY, order: { customer: { id: 'c-1' } } };
    const setup = (over: Record<string, unknown> = {}, updated = 1) => {
      const prisma = fakePrisma({ ...row, ...over }, updated);
      const storage = { remove: vi.fn() };
      const notifications = { send: vi.fn() };
      const orders = new ShopOrdersService(prisma as never, {} as never, storage as never, notifications as never);
      vi.spyOn(orders, 'detail').mockResolvedValue({} as never);
      return { prisma, storage, notifications, orders };
    };

    it('swaps the photo, clears the report, tells the customer and deletes the old one', async () => {
      const { prisma, storage, notifications, orders } = setup({ billIssueAt: new Date() });
      await orders.replaceBill(shop, 'S-1', { billKey: NEW_KEY });
      expect(prisma.tx.shopOrder.updateMany.mock.calls[0][0]).toMatchObject({ where: { shippingBillKey: OLD_KEY }, data: { shippingBillKey: NEW_KEY, billIssueAt: null } });
      expect(prisma.tx.orderStatusHistory.create.mock.calls[0][0].data).toMatchObject({ actorType: 'SHOP', note: BILL_REPLACED_NOTE });
      expect(notifications.send).toHaveBeenCalledOnce();
      expect(storage.remove).toHaveBeenCalledWith(OLD_KEY);
    });

    it("refuses another shop's file, and keeps the photo when the order just changed", async () => {
      const foreign = setup();
      await expect(foreign.orders.replaceBill(shop, 'S-1', { billKey: 's-other/orders/bill-x.jpg' })).rejects.toMatchObject({ status: 400 });
      const raced = setup({}, 0);
      await expect(raced.orders.replaceBill(shop, 'S-1', { billKey: NEW_KEY })).rejects.toBeDefined();
      expect(raced.storage.remove).not.toHaveBeenCalled();
    });

    it('is refused once the parcel arrived', async () => {
      const { orders, storage } = setup({ status: 'COMPLETED' });
      await expect(orders.replaceBill(shop, 'S-1', { billKey: NEW_KEY })).rejects.toMatchObject({ status: 409 });
      expect(storage.remove).not.toHaveBeenCalled();
    });
  });
});

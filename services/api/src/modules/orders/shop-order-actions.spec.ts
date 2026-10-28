import { canTransition, ORDER_STATUSES, SHOP_ORDER_ACTION_NAMES, SHOP_ORDER_ACTIONS, shopOrderActions } from '@talad/shared';

describe('shop order actions', () => {
  it('only move orders along allowed transitions', () => {
    for (const name of SHOP_ORDER_ACTION_NAMES) {
      const { from, to } = SHOP_ORDER_ACTIONS[name];
      for (const status of from) if (to) expect([name, canTransition(status, to)]).toEqual([name, true]);
    }
  });

  it('offer nothing on finished orders', () => {
    expect(shopOrderActions('COMPLETED')).toEqual([]);
    expect(shopOrderActions('CANCELLED')).toEqual([]);
  });

  it('give a paid order the two ways forward: ship with the bill, or out of stock', () => {
    expect(shopOrderActions('CONFIRMED')).toEqual(['pack', 'ship', 'out-of-stock', 'cancel']);
  });

  it('leave unchecked transfers and sent orders to Taladonline and the customer', () => {
    // PENDING: Taladonline checks the transfer; SHIPPED/DELIVERED: the customer confirms receipt.
    expect(shopOrderActions('PENDING')).toEqual([]);
    expect(shopOrderActions('SHIPPED')).toEqual([]);
  });

  it('cover every other active status', () => {
    for (const s of ORDER_STATUSES.filter((s) => !['COMPLETED', 'CANCELLED', 'DELIVERED', 'PENDING', 'SHIPPED'].includes(s))) {
      expect(shopOrderActions(s).length).toBeGreaterThan(0);
    }
  });
});

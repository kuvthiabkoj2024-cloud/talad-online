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

  it('let a paid-and-confirmed order be packed or cancelled, not shipped yet', () => {
    expect(shopOrderActions('CONFIRMED')).toEqual(['pack', 'cancel']);
  });

  it('cover every active status', () => {
    for (const s of ORDER_STATUSES.filter((s) => !['COMPLETED', 'CANCELLED', 'DELIVERED'].includes(s))) {
      expect(shopOrderActions(s).length).toBeGreaterThan(0);
    }
  });
});

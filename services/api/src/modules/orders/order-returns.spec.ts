import { RETURN_RULES, canTransition, returnDeadline, returnOpen } from '@talad/shared';
import { describe, expect, it, vi } from 'vitest';
import { evidenceKind } from './order-returns.service.js';
import { settleableOrders } from './order-transitions.js';
import { ShopOrdersService } from './shop-orders.service.js';

const DAY = 86_400_000;
const now = new Date('2026-11-10T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * DAY);

describe('returns', () => {
  it('are open while the order is on its way, whoever asks', () => {
    expect(returnOpen('SHIPPED', null, now)).toBe(true);
    expect(returnOpen('DELIVERED', null, now)).toBe(true);
  });

  it('stay open for the window after completing, then close', () => {
    expect(returnOpen('COMPLETED', daysAgo(RETURN_RULES.windowDays - 1), now)).toBe(true);
    expect(returnOpen('COMPLETED', daysAgo(RETURN_RULES.windowDays + 1), now)).toBe(false);
    expect(returnDeadline(daysAgo(0)).getTime()).toBe(now.getTime() + RETURN_RULES.windowDays * DAY);
  });

  it('are closed before shipping and once decided', () => {
    for (const status of ['PENDING', 'CONFIRMED', 'PACKED', 'CANCELLED', 'RETURN_REQUESTED'] as const) expect(returnOpen(status, daysAgo(0), now)).toBe(false);
  });

  it('follow the allowed transitions', () => {
    for (const from of ['SHIPPED', 'DELIVERED', 'COMPLETED'] as const) expect(canTransition(from, 'RETURN_REQUESTED')).toBe(true);
    expect(canTransition('RETURN_REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransition('RETURN_REQUESTED', 'COMPLETED')).toBe(true);
  });

  it('tell clips from photos by their stored name', () => {
    expect(evidenceKind('c-1/returns/evidence-a.mov')).toBe('VIDEO');
    expect(evidenceKind('c-1/returns/evidence-a.webm')).toBe('VIDEO');
    expect(evidenceKind('c-1/returns/evidence-a.jpg')).toBe('IMAGE');
  });

  it('hold transfers out of payouts until the window has passed', () => {
    const where = settleableOrders(now);
    expect(where.status).toBe('COMPLETED');
    expect(where.payoutId).toBeNull();
    expect(where.payments).toEqual({ none: { method: 'COD' } });
    expect(where.history).toEqual({ some: { toStatus: 'COMPLETED', createdAt: { lte: daysAgo(RETURN_RULES.windowDays) } } });
  });
});

describe('a return with a dispute open', () => {
  it("can't be decided by the shop", async () => {
    const row = { id: 'so', status: 'RETURN_REQUESTED', items: [], payments: [], order: { customer: { id: 'c' }, payments: [], shopOrders: [{ id: 'so' }], slips: [] } };
    const prisma = { shopOrder: { findFirst: vi.fn().mockResolvedValue(row) }, dispute: { count: vi.fn().mockResolvedValue(1) }, $transaction: vi.fn() };
    const orders = new ShopOrdersService(prisma as never, {} as never, {} as never, {} as never);
    await expect(orders.act({ id: 'shop' } as never, 'S-1', { action: 'approve-return' } as never)).rejects.toMatchObject({ status: 409 });
    await expect(orders.act({ id: 'shop' } as never, 'S-1', { action: 'reject-return', reason: 'No' } as never)).rejects.toMatchObject({ status: 409 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

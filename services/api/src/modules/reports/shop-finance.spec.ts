import { RETURN_RULES } from '@talad/shared';
import { describe, expect, it, vi } from 'vitest';
import { ShopReportsService } from './shop-reports.service.js';

const DAY = 86_400_000;
const money = (n: number) => n;
const payout = (id: string, status: string, net: number) => ({
  id,
  status,
  periodStart: new Date(),
  periodEnd: new Date(),
  grossAmount: net,
  commissionAmount: 0,
  refundAmount: 0,
  netAmount: money(net),
  paidAt: null,
  reference: null,
  slipKey: status === 'PAID' ? 'slip' : null,
});

function setup() {
  const old = new Date(Date.now() - (RETURN_RULES.windowDays + 1) * DAY);
  const recent = new Date(Date.now() - DAY);
  const order = (number: string, at: Date, total: number) => ({ number, total, commissionAmount: total / 10, platformDiscount: 0, history: [{ createdAt: at }] });
  const aggregate = vi.fn().mockResolvedValue({ _count: { _all: 0 }, _sum: {} });
  // The fourth aggregate is the one over all unpaid orders.
  aggregate.mockResolvedValueOnce({ _count: { _all: 0 }, _sum: {} });
  aggregate.mockResolvedValueOnce({ _count: { _all: 0 }, _sum: {} });
  aggregate.mockResolvedValueOnce({ _count: { _all: 0 }, _sum: {} });
  aggregate.mockResolvedValueOnce({ _count: { _all: 3 }, _sum: { total: 300_000, commissionAmount: 30_000, platformDiscount: 0 } });
  const prisma = {
    shopOrder: { aggregate, findMany: vi.fn().mockResolvedValue([order('A', old, 100_000), order('B', recent, 100_000)]) },
    payout: {
      findMany: vi.fn(({ where }: { where: { status: { in: string[] } } }) => {
        const all = [payout('s', 'SCHEDULED', 50_000), payout('w', 'PROCESSING', 25_000), payout('p', 'PAID', 999), payout('f', 'FAILED', 888)];
        return Promise.resolve(all.filter((p) => where.status.in.includes(p.status)));
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return { prisma, service: new ShopReportsService(prisma as never, {} as never, {} as never) };
}

describe('pending payouts', () => {
  it('count unpaid batches and orders in no batch, and add up what is owed', async () => {
    const { service } = setup();
    const { pending } = await service.finance('shop', new Date(), new Date());
    expect(pending.payouts.map((p) => p.id)).toEqual(['s', 'w']);
    expect(pending.count).toBe(2 + 3);
    expect(pending.amount).toBe(50_000 + 25_000 + 270_000);
    expect(pending.ordersTotal).toBe(3);
  });

  it('leave paid and failed payouts in the history', async () => {
    const { service } = setup();
    const { payouts } = await service.finance('shop', new Date(), new Date());
    expect(payouts.map((p) => p.id)).toEqual(['p', 'f']);
    expect(payouts[0].hasSlip).toBe(true);
  });

  it('say when an order can be paid: only after the return window', async () => {
    const { service } = setup();
    const { pending } = await service.finance('shop', new Date(), new Date());
    expect(pending.orders.map((o) => [o.number, o.ready, o.net])).toEqual([
      ['A', true, 90_000],
      ['B', false, 90_000],
    ]);
  });

  it('are worked out for transfers only, the same as payouts themselves', async () => {
    const { service, prisma } = setup();
    await service.finance('shop', new Date(), new Date());
    expect(prisma.shopOrder.findMany.mock.calls[0][0].where).toMatchObject({ shopId: 'shop', status: 'COMPLETED', payoutId: null, payments: { none: { method: 'COD' } } });
  });
});

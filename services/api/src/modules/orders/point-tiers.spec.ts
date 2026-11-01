import { pointTierRanges, pointTiersValid, pointsForTotal, type PointTier } from '@talad/shared';
import { describe, expect, it, vi } from 'vitest';
import { CmsService } from '../cms/cms.service.js';
import { onPromotion, pointsBase } from './checkout-pricing.js';
import { awardPoints, pointsFor, revokeEarnedPoints } from './order-transitions.js';

const TIERS: PointTier[] = [
  { upTo: null, points: 20 },
  { upTo: 100_000, points: 10 },
];
const money = (n: number) => ({ toNumber: () => n });
const settingsDb = (points: unknown) => ({ setting: { findUnique: vi.fn().mockResolvedValue({ value: points }) } });

describe('point ranges', () => {
  it('give the points of the range the total falls in, in any order, with the limit inclusive', () => {
    expect(pointsForTotal(TIERS, 1)).toBe(10);
    expect(pointsForTotal(TIERS, 100_000)).toBe(10);
    expect(pointsForTotal(TIERS, 100_001)).toBe(20);
    expect(pointsForTotal(TIERS, 50_000_000)).toBe(20);
  });

  it('give nothing for a free order, above the last range, or with no ranges', () => {
    expect(pointsForTotal(TIERS, 0)).toBe(0);
    expect(pointsForTotal([{ upTo: 100_000, points: 10 }], 100_001)).toBe(0);
    expect(pointsForTotal([], 100_000)).toBe(0);
  });

  it('must end at different amounts, with one open-ended at most', () => {
    expect(pointTiersValid(TIERS)).toBe(true);
    expect(pointTiersValid([{ upTo: 5, points: 1 }, { upTo: 5, points: 2 }])).toBe(false);
    expect(pointTiersValid([{ upTo: null, points: 1 }, { upTo: null, points: 2 }])).toBe(false);
    expect(pointTiersValid([{ upTo: 0, points: 1 }])).toBe(false);
  });

  it('read in order, each starting above the one before', () => {
    expect(pointTierRanges(TIERS)).toEqual([
      { upTo: 100_000, points: 10, over: 0 },
      { upTo: null, points: 20, over: 100_000 },
    ]);
  });

  it('replace the older per-kip rule once saved', async () => {
    const order = { pointsBase: null, total: money(250_000) } as never;
    await expect(pointsFor(settingsDb({ earnPer: 10_000 }) as never, order)).resolves.toBe(25);
    await expect(pointsFor(settingsDb({ earnPer: 10_000, earnTiers: TIERS }) as never, order)).resolves.toBe(20);
    await expect(pointsFor(settingsDb({ earnPer: 10_000, earnTiers: [] }) as never, order)).resolves.toBe(0);
  });

  it('are what confirming receipt awards, with the expiry', async () => {
    const tx = {
      ...settingsDb({ earnTiers: TIERS, expiryDays: 30 }),
      shopOrder: { findUnique: vi.fn().mockResolvedValue({ total: money(150_000), pointsBase: null, order: { id: 'o', customerId: 'c' } }), update: vi.fn() },
      pointTransaction: { create: vi.fn() },
      customer: { update: vi.fn() },
    };
    await expect(awardPoints(tx as never, 'so')).resolves.toBe(20);
    expect(tx.pointTransaction.create.mock.calls[0][0].data).toMatchObject({ type: 'EARN', points: 20 });
    expect(tx.pointTransaction.create.mock.calls[0][0].data.expiresAt).toBeInstanceOf(Date);
    expect(tx.shopOrder.update.mock.calls[0][0].data).toEqual({ pointsEarned: 20 });
  });

  describe('taken back after a return', () => {
    const setup = (updated = 1) => ({
      shopOrder: { findUnique: vi.fn().mockResolvedValue({ pointsEarned: 20, order: { id: 'o', customerId: 'c' } }), updateMany: vi.fn().mockResolvedValue({ count: updated }) },
      pointTransaction: { create: vi.fn() },
      customer: { update: vi.fn() },
    });

    it('come off in full, even past the balance when they were already spent', async () => {
      const tx = setup();
      await expect(revokeEarnedPoints(tx as never, 'so')).resolves.toBe(20);
      expect(tx.pointTransaction.create.mock.calls[0][0].data).toMatchObject({ type: 'ADJUST', points: -20 });
      expect(tx.customer.update.mock.calls[0][0].data).toEqual({ pointsBalance: { decrement: 20 } });
      expect(tx.shopOrder.updateMany.mock.calls[0][0].data).toEqual({ pointsEarned: 0 });
    });

    it('come off once', async () => {
      const tx = setup(0);
      await expect(revokeEarnedPoints(tx as never, 'so')).resolves.toBe(0);
      expect(tx.customer.update).not.toHaveBeenCalled();
    });
  });

  describe('with promotions and coupons', () => {
    const full = { lineTotal: 150_000, unitPrice: 150_000, regularPrice: 150_000, compareAtPrice: null };
    const flash = { lineTotal: 80_000, unitPrice: 80_000, regularPrice: 100_000, compareAtPrice: 100_000 };
    const crossedOut = { lineTotal: 90_000, unitPrice: 90_000, regularPrice: 90_000, compareAtPrice: 120_000 };

    it('tell what is on promotion', () => {
      expect(onPromotion(full)).toBe(false);
      expect(onPromotion(flash)).toBe(true);
      expect(onPromotion(crossedOut)).toBe(true);
      // A crossed-out price at or below the price isn't a discount.
      expect(onPromotion({ ...full, compareAtPrice: 150_000 })).toBe(false);
    });

    it('count only goods not on promotion, and nothing with a coupon', () => {
      expect(pointsBase([full], 0, 0)).toBe(150_000);
      expect(pointsBase([flash], 0, 0)).toBe(0);
      expect(pointsBase([crossedOut], 0, 0)).toBe(0);
      expect(pointsBase([full, flash], 0, 0)).toBe(150_000);
      expect(pointsBase([full], 1, 0)).toBe(0);
    });

    it('take off the share of points spent on the goods that count', () => {
      expect(pointsBase([full], 0, 50_000)).toBe(100_000);
      expect(pointsBase([{ ...full, lineTotal: 100_000 }, { ...crossedOut, lineTotal: 100_000 }], 0, 20_000)).toBe(90_000);
      expect(pointsBase([full], 0, 150_000)).toBe(0);
    });

    it('decide what is earned, and an older order still earns on its total', async () => {
      const db = settingsDb({ earnTiers: TIERS }) as never;
      await expect(pointsFor(db, { pointsBase: money(0), total: money(150_000) } as never)).resolves.toBe(0);
      await expect(pointsFor(db, { pointsBase: money(50_000), total: money(150_000) } as never)).resolves.toBe(10);
      await expect(pointsFor(db, { pointsBase: null, total: money(150_000) } as never)).resolves.toBe(20);
    });
  });

  describe('saved by an admin', () => {
    const setup = (stored: unknown) => {
      const upsert = vi.fn((args: unknown) => args);
      const prisma = {
        setting: { findMany: vi.fn().mockResolvedValue([{ key: 'points', value: stored }]), upsert },
        $transaction: vi.fn().mockResolvedValue([]),
      };
      const cms = new CmsService(prisma as never, { log: vi.fn() } as never);
      const save = (points: object) => cms.saveSettings({ id: 'a' } as never, { productModeration: 'pre', defaultCommissionRate: 5, paymentMethods: ['COD'], points: { redeemValue: 100, expiryDays: 365, ...points } } as never);
      const savedPoints = () => (upsert.mock.calls.map(([a]) => a as { where: { key: string }; update: { value: unknown } }).find((a) => a.where.key === 'points'))!.update.value;
      return { cms, save, savedPoints };
    };

    it('are stored sorted, and end the older rule', async () => {
      const { save, savedPoints } = setup({ earnPer: 10_000 });
      await save({ earnTiers: TIERS });
      expect(savedPoints()).toEqual({ earnTiers: [{ upTo: 100_000, points: 10 }, { upTo: null, points: 20 }], redeemValue: 100, expiryDays: 365 });
    });

    it('leave the older rule alone when other settings are saved', async () => {
      const { cms, save, savedPoints } = setup({ earnPer: 10_000, redeemValue: 100, expiryDays: 365 });
      await expect(cms.settings()).resolves.toMatchObject({ points: { legacyEarnPer: 10_000, earnTiers: [] } });
      await save({});
      expect(savedPoints()).toEqual({ earnPer: 10_000, redeemValue: 100, expiryDays: 365 });
    });

    it('are refused when two end at the same amount', async () => {
      const { save } = setup({});
      await expect(save({ earnTiers: [{ upTo: 5, points: 1 }, { upTo: 5, points: 2 }] })).rejects.toMatchObject({ status: 400 });
    });
  });
});

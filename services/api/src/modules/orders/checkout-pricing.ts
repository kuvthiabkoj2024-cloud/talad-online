/** Coupon rules for checkout (§4.4, §3.4). Pure functions so the maths is unit-testable. */

export type CouponErrorCode =
  | 'COUPON_INVALID'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_USED_UP'
  | 'COUPON_ALREADY_USED'
  | 'COUPON_MIN_ORDER'
  | 'COUPON_OWN_SHOP';

export interface CouponRule {
  id: string;
  /** null = platform-wide; otherwise only that shop's items count. */
  shopId: string | null;
  code: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  perCustomer: number | null;
  usedCount: number;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
}

/** Codes are typed by hand: ignore case and surrounding spaces. */
export const normalizeCouponCode = (code: string) => code.trim().toUpperCase();

/** Why `rule` can't be used on `base` (the subtotal it applies to), or null if it can. */
export function couponProblem(
  rule: CouponRule,
  { base, now, usedByCustomer, ownShop = false }: { base: number; now: Date; usedByCustomer: number; ownShop?: boolean },
): CouponErrorCode | null {
  if (!rule.isActive) return 'COUPON_INVALID';
  // A seller can't give themselves their own shop's discount.
  if (ownShop) return 'COUPON_OWN_SHOP';
  if (now < rule.startsAt) return 'COUPON_NOT_STARTED';
  if (now > rule.endsAt) return 'COUPON_EXPIRED';
  if (rule.usageLimit !== null && rule.usedCount >= rule.usageLimit) return 'COUPON_USED_UP';
  if (rule.perCustomer !== null && usedByCustomer >= rule.perCustomer) return 'COUPON_ALREADY_USED';
  if (base <= 0 || (rule.minOrderAmount !== null && base < rule.minOrderAmount)) return 'COUPON_MIN_ORDER';
  return null;
}

/** Discount in whole kip, never more than the amount it applies to. */
export function couponDiscount(rule: CouponRule, base: number): number {
  let discount = rule.type === 'PERCENTAGE' ? Math.floor((base * rule.value) / 100) : Math.round(rule.value);
  if (rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  return Math.max(0, Math.min(discount, base));
}

/**
 * Splits a platform-wide discount over shop orders in proportion to their subtotals
 * (each shop is paid separately). Rounding leftovers go to the largest shop so the
 * parts always add up to `discount`.
 */
export function allocateDiscount(discount: number, shops: { id: string; subtotal: number }[]): Map<string, number> {
  const total = shops.reduce((n, s) => n + s.subtotal, 0);
  const parts = new Map(shops.map((s) => [s.id, total > 0 ? Math.floor((discount * s.subtotal) / total) : 0]));
  const largest = shops.reduce<{ id: string; subtotal: number } | null>(
    (best, s) => (!best || s.subtotal > best.subtotal ? s : best),
    null,
  );
  if (largest) {
    const assigned = [...parts.values()].reduce((n, v) => n + v, 0);
    parts.set(largest.id, parts.get(largest.id)! + discount - assigned);
  }
  return parts;
}

/**
 * Commission per item: each at its own rate, on what it sold for after its share of a
 * shop-funded coupon (the shop gave that discount; a platform coupon doesn't lower the fee).
 */
export function itemCommissions(lines: { id: string; lineTotal: number; rate: number }[], shopDiscount: number): Map<string, number> {
  const shares = allocateDiscount(shopDiscount, lines.map((l) => ({ id: l.id, subtotal: l.lineTotal })));
  return new Map(lines.map((l) => [l.id, Math.round(((l.lineTotal - (shares.get(l.id) ?? 0)) * l.rate) / 100)]));
}

/**
 * What a shop is owed for an order: what the customer paid it, plus the discount Taladonline
 * funds (platform coupons, paid back to the shop), minus commission.
 */
export function shopNet(o: { total: number; platformDiscount: number; commission: number }): number {
  return o.total + o.platformDiscount - o.commission;
}

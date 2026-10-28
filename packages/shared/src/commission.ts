/**
 * Taladonline's commission (§2.3): a percent of what an item sold for, or a fixed amount per
 * unit sold (for high-cost goods, where a percent would eat the shop's margin).
 */
export const COMMISSION_TYPES = ['PERCENT', 'FIXED'] as const;
export type CommissionType = (typeof COMMISSION_TYPES)[number];

export interface Commission {
  type: CommissionType;
  /** Percent (PERCENT) or kip per unit sold (FIXED). */
  value: number;
}

export const COMMISSION_RULES = { percentMax: 50, fixedMax: 10_000_000, reasonMax: 300 } as const;

/** A level's commission as stored: a fixed amount wins over a rate (only one is ever set). */
export function commissionOf(rate: number | null | undefined, fixed: number | null | undefined): Commission | null {
  if (fixed != null) return { type: 'FIXED', value: fixed };
  if (rate != null) return { type: 'PERCENT', value: rate };
  return null;
}

/** The stored columns for a commission (null clears both). */
export function commissionColumns(c: Commission | null): { rate: number | null; fixed: number | null } {
  if (!c) return { rate: null, fixed: null };
  return c.type === 'FIXED' ? { rate: null, fixed: c.value } : { rate: c.value, fixed: null };
}

/** Whether `c` is within the limits for its type. */
export function validCommission(c: Commission): boolean {
  if (!(COMMISSION_TYPES as readonly string[]).includes(c.type) || !Number.isFinite(c.value) || c.value < 0) return false;
  return c.type === 'PERCENT' ? c.value <= COMMISSION_RULES.percentMax : c.value <= COMMISSION_RULES.fixedMax && Number.isInteger(c.value);
}

/**
 * The fee on one order line: `net` is what it sold for (after any shop-funded discount). A
 * fixed fee is per unit and never more than the line itself.
 */
export function commissionFee(c: Commission, net: number, quantity: number): number {
  if (c.type === 'FIXED') return Math.max(0, Math.min(Math.round(c.value * quantity), Math.round(net)));
  return Math.round((net * c.value) / 100);
}

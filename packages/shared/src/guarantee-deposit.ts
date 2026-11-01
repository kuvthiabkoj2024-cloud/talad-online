/** A product's guarantee, and the deposit a shop can ask for with cash on delivery. */

export const GUARANTEE_UNITS = ['DAY', 'MONTH', 'YEAR'] as const;
export type GuaranteeUnit = (typeof GUARANTEE_UNITS)[number];

/** The customer gets `multiplier` times the period the shop enters. */
export const GUARANTEE_RULES = { durationMax: 120, termsMax: 1000, multiplier: 2 } as const;

export const customerGuarantee = (duration: number): number => duration * GUARANTEE_RULES.multiplier;

/** When a guarantee starting on `start` ends. The 31st plus a month lands on the last day of a shorter month. */
export function guaranteeEnd(start: Date, duration: number, unit: GuaranteeUnit): Date {
  const end = new Date(start);
  if (unit === 'DAY') {
    end.setUTCDate(end.getUTCDate() + duration);
    return end;
  }
  const day = end.getUTCDate();
  end.setUTCMonth(end.getUTCMonth() + (unit === 'YEAR' ? duration * 12 : duration));
  if (end.getUTCDate() !== day) end.setUTCDate(0);
  return end;
}

export const DEPOSIT_TYPES = ['AMOUNT', 'PERCENT'] as const;
export type DepositType = (typeof DEPOSIT_TYPES)[number];

export const DEPOSIT_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'RETURN_DUE', 'RETURNED', 'KEPT'] as const;
export type DepositStatus = (typeof DEPOSIT_STATUSES)[number];

/** `reviewHours`: how long a slip can wait for the shop, or a rejected one for a new slip, before the order cancels. */
export const DEPOSIT_RULES = { percentMax: 100, reviewHours: 24, reasonMax: 300 } as const;

/** A line's deposit: an amount per unit, or a percent of what the line costs. Never more than the line. */
export function lineDeposit(line: { lineTotal: number; quantity: number }, rule: { type: DepositType; value: number } | null): number {
  if (!rule) return 0;
  const amount = rule.type === 'AMOUNT' ? rule.value * line.quantity : Math.round((line.lineTotal * rule.value) / 100);
  return Math.min(amount, line.lineTotal);
}

/** The deposit is still being settled, so the shop can't send the order yet. */
export const depositBlocksShipping = (status: DepositStatus | null): boolean => status === 'PENDING' || status === 'REJECTED';

export const DEPOSIT_NOTES = {
  submitted: 'Deposit slip submitted',
  confirmed: 'Deposit confirmed by the shop',
  rejected: 'Deposit slip rejected',
  expired: 'Deposit not confirmed in time',
  returned: 'Deposit returned by the shop',
} as const;

import { BadRequestException } from '@nestjs/common';
import { commissionColumns, formatMoney, validCommission, type Commission, type Locale } from '@talad/shared';

/** The DB columns for a commission, after checking its limits (400 INVALID_COMMISSION). */
export function commissionData(c: Commission | null): { commissionRate: number | null; commissionFixed: number | null } {
  if (c && !validCommission(c)) {
    throw new BadRequestException({ code: 'INVALID_COMMISSION', message: 'A percent is 0–50; a fixed amount is whole kip' });
  }
  const { rate, fixed } = commissionColumns(c);
  return { commissionRate: rate, commissionFixed: fixed };
}

/** "3%" or "₭50,000 / unit" for notifications. */
export function commissionText(c: Commission, locale: Locale): string {
  return c.type === 'PERCENT' ? `${c.value}%` : `${formatMoney(c.value, locale)} ${locale === 'lo' ? '/ ຊິ້ນ' : '/ unit'}`;
}

import { COUPON_RULES, PRODUCT_RULES } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

/** What a coupon gives and when — shared by single codes and generated batches. */
export class CouponRulesDto {
  @IsIn(['PERCENTAGE', 'FIXED_AMOUNT'])
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';

  /** Percent off (1–90) or an amount in LAK. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(PRODUCT_RULES.maxPrice)
  value: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(PRODUCT_RULES.maxPrice)
  minOrderAmount?: number | null;

  /** Cap for percentage coupons. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(PRODUCT_RULES.maxPrice)
  maxDiscount?: number | null;

  /** Per customer; null = unlimited. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(1000)
  perCustomer?: number | null;

  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @Type(() => Date)
  @IsDate()
  endsAt: Date;

  @IsBoolean()
  isActive: boolean;
}

/** One code; `usageLimit` caps how many customers (or times) can use it. */
export class ShopCouponDto extends CouponRulesDto {
  @Transform(upper)
  @Matches(COUPON_RULES.codePattern)
  code: string;

  /** Total redemptions; null = unlimited. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  usageLimit?: number | null;
}

/** Many distinct codes with the same rules, e.g. one per customer on printed vouchers. */
export class CouponBatchDto extends CouponRulesDto {
  @IsInt()
  @Min(2)
  @Max(COUPON_RULES.batchMax)
  quantity: number;

  @IsOptional()
  @Transform(upper)
  @Matches(COUPON_RULES.prefixPattern)
  prefix?: string;

  /** How many times each code can be used (1 = a single-use voucher). */
  @IsInt()
  @Min(1)
  @Max(1000)
  usesPerCode: number;
}

export class CouponActiveDto {
  @IsBoolean()
  isActive: boolean;
}

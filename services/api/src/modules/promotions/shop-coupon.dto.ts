import { COUPON_RULES, PRODUCT_RULES } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsIn, IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateIf } from 'class-validator';

const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class ShopCouponDto {
  @Transform(upper)
  @Matches(COUPON_RULES.codePattern)
  code: string;

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

  /** Total redemptions; null = unlimited. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  usageLimit?: number | null;

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

export class CouponActiveDto {
  @IsBoolean()
  isActive: boolean;
}

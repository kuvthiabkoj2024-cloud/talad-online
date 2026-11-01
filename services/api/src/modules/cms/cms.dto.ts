import { CHECKOUT_PAYMENT_METHODS, POINT_TIER_RULES } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { cleanPageBody } from './page-html.js';

export class PageTextDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  title: string;

  /** HTML from the admin editor (cleaned to safe formatting tags); older pages are plain text. */
  @Transform(({ value }) => (typeof value === 'string' ? cleanPageBody(value) : value))
  @IsString()
  @MaxLength(100_000)
  body: string;
}

export class CmsPageDto {
  @ValidateNested()
  @Type(() => PageTextDto)
  lo: PageTextDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PageTextDto)
  en?: PageTextDto;
}

export class PointTierDto {
  /** Highest order total in this range; null = any amount above the other ranges. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(POINT_TIER_RULES.amountMax)
  upTo: number | null;

  @IsInt()
  @Min(0)
  @Max(POINT_TIER_RULES.pointsMax)
  points: number;
}

export class PointRulesDto {
  /** Omitted: keep the older "1 point per kip" rule until ranges are added. Empty: earning is off. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(POINT_TIER_RULES.maxTiers)
  @ValidateNested({ each: true })
  @Type(() => PointTierDto)
  earnTiers?: PointTierDto[];

  /** Kip a point is worth when redeemed. */
  @IsInt()
  @Min(0)
  @Max(100_000)
  redeemValue: number;

  @IsInt()
  @Min(0)
  @Max(3650)
  expiryDays: number;
}

export class PlatformSettingsDto {
  @IsIn(['pre', 'post'])
  productModeration: 'pre' | 'post';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  defaultCommissionRate: number;

  @IsArray()
  @ArrayMaxSize(CHECKOUT_PAYMENT_METHODS.length)
  @IsIn(CHECKOUT_PAYMENT_METHODS, { each: true })
  paymentMethods: string[];

  @ValidateNested()
  @Type(() => PointRulesDto)
  points: PointRulesDto;
}

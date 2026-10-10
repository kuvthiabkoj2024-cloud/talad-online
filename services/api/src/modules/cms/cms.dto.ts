import { CHECKOUT_PAYMENT_METHODS } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class PageTextDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 120)
  title: string;

  /** Plain text; blank lines separate paragraphs, lines starting with "# " are headings. */
  @IsString()
  @MaxLength(50_000)
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

export class PointRulesDto {
  /** Kip spent per point earned. */
  @IsInt()
  @Min(0)
  @Max(10_000_000)
  earnPer: number;

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

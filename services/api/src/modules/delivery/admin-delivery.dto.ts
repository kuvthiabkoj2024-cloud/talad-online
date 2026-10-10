import { PROVINCE_CODES } from '@talad/shared';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DeliveryProviderDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(/^[a-z0-9-]{2,30}$/)
  code: string;

  @Transform(trim)
  @IsString()
  @Length(2, 80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string | null;

  /** `manual`: the shop arranges delivery; `api`: integrated tracking (future). */
  @IsIn(['manual', 'api'])
  mode: 'manual' | 'api';

  @IsBoolean()
  isActive: boolean;
}

export class ShippingZoneDto {
  @Transform(trim)
  @IsString()
  @Length(1, 80)
  name: string;

  /** Province codes; empty = nationwide. */
  @IsArray()
  @ArrayMaxSize(PROVINCE_CODES.length)
  @IsIn(PROVINCE_CODES, { each: true })
  provinces: string[];

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  baseFee: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  perKgFee: number;
}

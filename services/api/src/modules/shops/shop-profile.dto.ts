import { PROVINCE_CODES, SHOP_PROFILE_RULES, SHOP_RULES, URGENT_RULES } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class UrgentZoneDto {
  @IsIn(PROVINCE_CODES)
  province: string;

  /** District names; empty = the whole province. */
  @IsArray()
  @ArrayMaxSize(URGENT_RULES.maxDistricts)
  @IsString({ each: true })
  @MaxLength(URGENT_RULES.districtMax, { each: true })
  districts: string[];

  @IsInt()
  @Min(0)
  @Max(URGENT_RULES.feeMax)
  fee: number;
}

export class UrgentDeliveryDto {
  @IsBoolean()
  enabled: boolean;

  @Transform(trim)
  @IsString()
  @MaxLength(URGENT_RULES.etaMax)
  eta: string;

  @IsArray()
  @ArrayMaxSize(URGENT_RULES.maxZones)
  @ValidateNested({ each: true })
  @Type(() => UrgentZoneDto)
  zones: UrgentZoneDto[];
}

export class ShopProfileDto {
  @Transform(trim)
  @IsString()
  @Length(SHOP_RULES.nameMin, SHOP_RULES.nameMax)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SHOP_RULES.descriptionMax)
  description?: string;

  /** Optional; an empty field means no email. */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || null : value))
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @IsString()
  phone: string;

  /** Pickup address for couriers. */
  @Transform(trim)
  @IsString()
  @Length(5, SHOP_RULES.addressMax)
  address: string;

  /** `{ mon: { open: "08:00", close: "18:00" }, … }`; missing days are closed. */
  @IsOptional()
  @IsObject()
  businessHours?: Record<string, unknown>;

  /** `{ facebook: "…", whatsapp: "…" }`. */
  @IsOptional()
  @IsObject()
  socialLinks?: Record<string, unknown>;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  paymentBankCode?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  @MaxLength(100)
  paymentAccountName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsString()
  paymentAccountNumber?: string | null;

  @IsInt()
  @Min(SHOP_PROFILE_RULES.paymentWindowHrs.min)
  @Max(SHOP_PROFILE_RULES.paymentWindowHrs.max)
  paymentWindowHrs: number;

  @IsInt()
  @Min(SHOP_PROFILE_RULES.autoConfirmHrs.min)
  @Max(SHOP_PROFILE_RULES.autoConfirmHrs.max)
  autoConfirmHrs: number;

  /** Offer cash on delivery; left out, the current choice stays. */
  @IsOptional()
  @IsBoolean()
  codEnabled?: boolean;

  /** The owner accepted the COD terms just now (needed to turn COD on). */
  @IsOptional()
  @IsBoolean()
  codTermsAccepted?: boolean;

  /** The shop's own urgent delivery; left out, the current settings stay. */
  @IsOptional()
  @ValidateNested()
  @Type(() => UrgentDeliveryDto)
  urgentDelivery?: UrgentDeliveryDto;
}

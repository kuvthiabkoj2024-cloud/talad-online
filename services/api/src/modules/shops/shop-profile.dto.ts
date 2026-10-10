import { SHOP_PROFILE_RULES, SHOP_RULES } from '@talad/shared';
import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsObject, IsOptional, IsString, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  email: string;

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
}

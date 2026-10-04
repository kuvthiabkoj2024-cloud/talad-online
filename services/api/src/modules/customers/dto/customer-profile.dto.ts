import { ADDRESS_LABELS, BANK_CODES, PROVINCE_CODES, type AddressLabel, type BankCode, type ProvinceCode } from '@talad/shared';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Length, ValidateIf } from 'class-validator';

export class ProfileDto {
  @IsString()
  @Length(2, 100)
  name: string;

  /** Optional; empty or null clears it. */
  @IsOptional()
  @ValidateIf((_, v) => typeof v === 'string' && v.trim() !== '')
  @IsEmail()
  @Length(3, 254)
  email?: string | null;
}

export class AddressDto {
  @IsOptional()
  @IsIn(ADDRESS_LABELS)
  label?: AddressLabel;

  @IsString()
  @Length(2, 100)
  recipientName: string;

  /** Any common Lao mobile format; normalized server-side. */
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsIn(PROVINCE_CODES)
  province: ProvinceCode;

  @IsString()
  @Length(1, 100)
  district: string;

  @IsOptional()
  @IsString()
  @Length(0, 100)
  village?: string;

  /** House number, street, building. */
  @IsString()
  @Length(3, 255)
  line: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class BankAccountDto {
  @IsIn(BANK_CODES)
  bankCode: BankCode;

  @IsString()
  @Length(2, 100)
  accountName: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  /** Key returned by the QR upload endpoint; null removes the QR. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  qrImageKey?: string | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

import { KYC_DOCUMENT_TYPES, SHOP_RULES, type KycDocumentType } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class KycDocumentDto {
  @IsIn(KYC_DOCUMENT_TYPES)
  type: KycDocumentType;

  /** From POST me/shop/application/documents. */
  @IsString()
  key: string;
}

/** A shop application (§3.1): business info, pickup address and KYC documents. */
export class ShopApplicationDto {
  @Transform(trim)
  @IsString()
  @Length(SHOP_RULES.nameMin, SHOP_RULES.nameMax)
  name: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(SHOP_RULES.slugPattern)
  slug: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SHOP_RULES.descriptionMax)
  description?: string;

  /** Legal owner / business owner name. */
  @Transform(trim)
  @IsString()
  @Length(2, 100)
  ownerName: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  email: string;

  /** Business phone; normalized server-side. */
  @IsString()
  phone: string;

  /** Where couriers pick up orders. */
  @Transform(trim)
  @IsString()
  @Length(5, SHOP_RULES.addressMax)
  address: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SHOP_RULES.maxKycDocuments)
  @ValidateNested({ each: true })
  @Type(() => KycDocumentDto)
  documents: KycDocumentDto[];

  @Equals(true)
  acceptTerms: boolean;
}

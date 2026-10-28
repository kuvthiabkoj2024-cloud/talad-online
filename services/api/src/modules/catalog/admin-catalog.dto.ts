import { Transform, Type } from 'class-transformer';
import { CommissionDto } from './commission/commission.dto.js';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

/** `{ lo, en }` display names; Lao is required (the default storefront language). */
export class LocalizedNameDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80)
  lo: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(80)
  en?: string;
}

export class AdminCategoryDto {
  /** Web address part (`/c/food`). Optional: made from the English name; kept as is on edits. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value))
  @Matches(/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/)
  slug?: string;

  @ValidateNested()
  @Type(() => LocalizedNameDto)
  name: LocalizedNameDto;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsUUID('7')
  parentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  iconUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder: number;

  @IsBoolean()
  isActive: boolean;

  /** For products in this category (wins over the shop's own); null = none. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => CommissionDto)
  commission?: CommissionDto | null;
}

export class AdminUnitDto {
  /** Short internal key. Optional: made from the English name; kept as is on edits. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() || undefined : value))
  @Matches(/^[a-z0-9]{1,12}$/)
  code?: string;

  @ValidateNested()
  @Type(() => LocalizedNameDto)
  name: LocalizedNameDto;
}

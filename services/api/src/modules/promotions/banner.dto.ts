import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { LocalizedNameDto } from '../catalog/admin-catalog.dto.js';

export class BannerDto {
  @ValidateNested()
  @Type(() => LocalizedNameDto)
  title: LocalizedNameDto;

  /** From POST admin/uploads (a storage key or URL). */
  @IsString()
  @MaxLength(500)
  imageUrl: string;

  /** Storefront path the banner opens, e.g. `/c/food` or `/s/talad-demo`. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^(\/[^\s]*)?$/)
  linkTarget?: string | null;

  @IsInt()
  @Min(0)
  @Max(1000)
  sortOrder: number;

  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @Type(() => Date)
  @IsDate()
  endsAt: Date;

  @IsBoolean()
  isActive: boolean;
}

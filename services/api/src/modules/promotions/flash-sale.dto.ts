import { FLASH_SALE_RULES } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDate, IsInt, IsString, IsUUID, Length, Max, Min, ValidateNested } from 'class-validator';

export class FlashSaleItemDto {
  @IsUUID('7')
  productId: string;

  @IsInt()
  @Min(FLASH_SALE_RULES.minPercent)
  @Max(FLASH_SALE_RULES.maxPercent)
  discountPercent: number;
}

export class FlashSaleDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, FLASH_SALE_RULES.nameMax)
  name: string;

  @Type(() => Date)
  @IsDate()
  startsAt: Date;

  @Type(() => Date)
  @IsDate()
  endsAt: Date;

  @IsBoolean()
  isActive: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(FLASH_SALE_RULES.maxItems)
  @ValidateNested({ each: true })
  @Type(() => FlashSaleItemDto)
  items: FlashSaleItemDto[];
}

import {
  MEDIA_LIMITS,
  PRODUCT_RULES,
  PRODUCT_SAVE_INTENTS,
  PRODUCT_STATUSES,
  type ProductSaveIntent,
  type ProductStatus,
} from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ShopProductVariantDto {
  /** Existing variant to update; omitted = new option. */
  @IsOptional()
  @IsUUID('7')
  id?: string;

  /** Option value, e.g. "L" or "500 g". */
  @Transform(trim)
  @IsString()
  @Length(1, 50)
  value: string;

  @Transform(trim)
  @Matches(PRODUCT_RULES.skuPattern)
  sku: string;

  /** null = same as the product price. */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(PRODUCT_RULES.maxPrice)
  price?: number | null;

  @IsInt()
  @Min(0)
  @Max(PRODUCT_RULES.maxStock)
  stock: number;
}

export class ShopProductDto {
  @IsIn(PRODUCT_SAVE_INTENTS)
  intent: ProductSaveIntent;

  @Transform(trim)
  @IsString()
  @Length(1, PRODUCT_RULES.nameMax)
  name: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(PRODUCT_RULES.descriptionMax)
  description?: string;

  @IsUUID('7')
  categoryId: string;

  @IsUUID('7')
  unitId: string;

  @Transform(trim)
  @Matches(PRODUCT_RULES.skuPattern)
  sku: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(PRODUCT_RULES.maxPrice)
  price: number;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(PRODUCT_RULES.maxPrice)
  compareAtPrice?: number | null;

  /** Ignored when the product has variants (stock is per option then). */
  @IsInt()
  @Min(0)
  @Max(PRODUCT_RULES.maxStock)
  stock: number;

  @IsInt()
  @Min(0)
  @Max(PRODUCT_RULES.maxStock)
  lowStockThreshold: number;

  /** Uploaded image keys, cover first. */
  @IsArray()
  @ArrayMaxSize(MEDIA_LIMITS.maxImagesPerProduct)
  @IsString({ each: true })
  imageKeys: string[];

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  videoKey?: string | null;

  /** Name of the option the variants differ by, e.g. "Size". Required with variants. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 30)
  variantOption?: string;

  @IsArray()
  @ArrayMaxSize(PRODUCT_RULES.maxVariants)
  @ValidateNested({ each: true })
  @Type(() => ShopProductVariantDto)
  variants: ShopProductVariantDto[];
}

export class ListShopProductsQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: ProductStatus;

  /** Products that have (`with`) or still need (`without`) a video. */
  @IsOptional()
  @IsIn(['with', 'without'])
  video?: 'with' | 'without';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 20;
}

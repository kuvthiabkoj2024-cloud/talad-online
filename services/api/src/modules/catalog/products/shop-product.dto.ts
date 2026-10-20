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
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
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

  /** One value per option, e.g. { "Colour": "Red", "Size": "M" }. */
  @IsObject()
  attributes: Record<string, string>;

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

/** An option the variants differ by, with its values in the order shown to customers. */
export class ShopProductOptionDto {
  @Transform(trim)
  @IsString()
  @Length(1, 30)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PRODUCT_RULES.maxOptionValues)
  @Transform(({ value }: { value: unknown }) => (Array.isArray(value) ? value.map((v) => (typeof v === 'string' ? v.trim() : v)) : value))
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  values: string[];
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

  /** What the variants differ by (1–2 options, e.g. colour and size). Required with variants. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_RULES.maxOptions)
  @ValidateNested({ each: true })
  @Type(() => ShopProductOptionDto)
  options?: ShopProductOptionDto[];

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

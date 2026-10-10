import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const PRODUCT_SORTS = ['popular', 'new'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export class ListProductsQuery {
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort: ProductSort = 'popular';

  /** Category slug; a top-level category includes its subcategories. */
  @IsOptional()
  @IsString()
  category?: string;

  /** Shop slug. */
  @IsOptional()
  @IsString()
  shop?: string;

  /** Product id to leave out (e.g. the product currently being viewed). */
  @IsOptional()
  @IsString()
  exclude?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  limit: number = 24;
}

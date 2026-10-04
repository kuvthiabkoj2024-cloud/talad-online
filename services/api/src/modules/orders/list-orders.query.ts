import { ORDER_TABS, type OrderTab } from '@talad/shared';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListOrdersQuery {
  /** Status tab; omitted = all orders. */
  @IsOptional()
  @IsIn(Object.keys(ORDER_TABS))
  tab?: OrderTab;

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
  pageSize: number = 5;
}

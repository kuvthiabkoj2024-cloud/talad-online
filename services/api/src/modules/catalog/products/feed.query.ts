import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FeedQuery {
  /** Id of the last item of the previous page. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Only shops' product videos or only customers' own; omitted = both. */
  @IsOptional()
  @IsIn(['shop', 'customer'])
  type?: 'shop' | 'customer';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 8;
}

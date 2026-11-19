import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class FeedQuery {
  /** Id of the last item of the previous page. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Only shops' product videos or only customers' own; omitted = both. */
  @IsOptional()
  @IsIn(['shop', 'customer'])
  type?: 'shop' | 'customer';

  /**
   * Search the videos: every word must be in a post's caption (hashtags too: "#cat" or "cat")
   * or poster's name, or a product video's name, description, brand or shop.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 8;
}

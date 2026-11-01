import { RETURN_REASONS, RETURN_RULES, type ReturnReason } from '@talad/shared';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Reported by the shop: the reason is always "not collected". */
export class ShopReturnDto {
  @IsOptional()
  @IsString()
  @MaxLength(RETURN_RULES.detailsMax)
  details?: string;

  /** Keys from the evidence upload. */
  @IsArray()
  @ArrayMaxSize(RETURN_RULES.maxFiles)
  @IsString({ each: true })
  evidenceKeys: string[];
}

export class CustomerReturnDto extends ShopReturnDto {
  @IsIn(RETURN_REASONS)
  reason: ReturnReason;
}

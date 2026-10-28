import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { COMMISSION_RULES, COMMISSION_TYPES, type CommissionType } from '@talad/shared';

/** A percent, or a fixed kip amount per unit sold. */
export class CommissionDto {
  @IsIn(COMMISSION_TYPES)
  type: CommissionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(COMMISSION_RULES.fixedMax)
  value: number;
}

/** `commission: null` = no override here (the next level applies). */
export class CommissionBodyDto {
  @ValidateIf((_, v) => v !== null)
  @ValidateNested()
  @Type(() => CommissionDto)
  commission: CommissionDto | null;
}

/** A shop asks for its own commission on one product. */
export class CommissionRequestDto extends CommissionDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(COMMISSION_RULES.reasonMax)
  reason?: string;
}

/** `?status=PENDING|APPROVED|REJECTED|CANCELLED&page=` */
export class CommissionRequestQuery {
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page?: number;
}

export class ReviewNoteDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value))
  @IsString()
  @MaxLength(COMMISSION_RULES.reasonMax)
  note?: string;
}

import {
  BROADCAST_AUDIENCES,
  BROADCAST_CHANNELS,
  BROADCAST_REPEATS,
  BROADCAST_TYPES,
  type BroadcastAudience,
  type BroadcastChannel,
  type BroadcastRepeat,
  type BroadcastType,
} from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class MessageDto {
  @Transform(trim)
  @IsString()
  @Length(1, 120)
  title: string;

  @Transform(trim)
  @IsString()
  @Length(1, 1000)
  body: string;
}

class ContentDto {
  @ValidateNested()
  @Type(() => MessageDto)
  lo: MessageDto;

  @ValidateNested()
  @Type(() => MessageDto)
  en: MessageDto;
}

/** A new broadcast (rules the DTO can't express are checked in BroadcastsService.create). */
export class CreateBroadcastDto {
  @IsIn(BROADCAST_AUDIENCES)
  audience: BroadcastAudience;

  /** audience = customer. */
  @IsOptional()
  @IsUUID('7')
  targetCustomerId?: string;

  /** audience = shop. */
  @IsOptional()
  @IsUUID('7')
  targetShopId?: string;

  @IsIn(BROADCAST_TYPES)
  type: BroadcastType;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsIn(BROADCAST_CHANNELS, { each: true })
  channels: BroadcastChannel[];

  @ValidateNested()
  @Type(() => ContentDto)
  content: ContentDto;

  /** Where it opens: a storefront path (or a Seller Center path for shops), e.g. `/feed`. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/^\/[^\s]*$/)
  link?: string;

  @IsIn(BROADCAST_REPEATS)
  repeat: BroadcastRepeat;

  /** WEEKLY: 0 = Sunday … 6 = Saturday. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  /** First send (ISO time); omitted = now. Repeats go out at its Vientiane time of day. */
  @IsOptional()
  @IsDateString()
  startAt?: string;

  /** No sends after this (repeating only). */
  @IsOptional()
  @IsDateString()
  endAt?: string;
}

export class TargetSearchQuery {
  @IsIn(['customer', 'shop'])
  kind: 'customer' | 'shop';

  @Transform(trim)
  @IsString()
  @Length(1, 60)
  q: string;
}

export class AudienceCountQuery {
  @IsIn(BROADCAST_AUDIENCES)
  audience: BroadcastAudience;

  @IsOptional()
  @IsUUID('7')
  targetCustomerId?: string;

  @IsOptional()
  @IsUUID('7')
  targetShopId?: string;
}

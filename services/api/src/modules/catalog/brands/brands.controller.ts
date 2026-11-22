import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BrandsService } from './brands.service.js';

class ListBrandsQuery {
  /** Category slug: brands with products there (a top-level category includes its subcategories). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  /** Shop slug: brands this shop sells (the shop page's brand chips). */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shop?: string;

  /** Name contains this (product form suggestions; also lists brands without products yet). */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 40;
}

/** Product brands: the category and shop pages' brand filters and the product form's suggestions. */
@ApiTags('catalog')
@Controller('brands')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Get()
  list(@Query() query: ListBrandsQuery) {
    return this.brands.list(query);
  }
}

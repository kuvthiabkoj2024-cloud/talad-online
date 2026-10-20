import { Controller, Get, HttpCode, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Type } from 'class-transformer';
import { IsInt, IsString, Length, Max, Min, IsOptional } from 'class-validator';
import { ProductsService } from '../products/products.service.js';
import { ImageIndexService } from './image-index.service.js';
import { PHOTO_SEARCH_LIMITS, PhotoSearchService } from './photo-search.service.js';

class SearchQuery {
  @IsString()
  @Length(1, 100)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize: number = 24;
}

/** Storefront search: typed words and "scan a photo" (§5). Public — guests can search. */
@ApiTags('catalog')
@Controller('products/search')
export class PhotoSearchController {
  constructor(
    private readonly products: ProductsService,
    private readonly photos: PhotoSearchService,
    private readonly index: ImageIndexService,
  ) {}

  /** `?q=&page=` */
  @Get()
  search(@Query() q: SearchQuery) {
    return this.products.search(q.q, q.page, q.pageSize);
  }

  /** Multipart field `file`: a JPG, PNG or WebP photo up to 8 MB. */
  @Post('image')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_SEARCH_LIMITS.maxBytes, files: 1 } }))
  searchByPhoto(@UploadedFile() file?: Express.Multer.File) {
    return this.photos.search(file);
  }

  /** Indexing progress (photos with / without an embedding). */
  @Get('image/status')
  status() {
    return this.index.status();
  }
}

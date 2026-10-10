import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FeedQuery } from './feed.query.js';
import { ListProductsQuery } from './list-products.query.js';
import { ProductsService } from './products.service.js';

@ApiTags('catalog')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsQuery) {
    return this.products.list(query);
  }

  /** Products in running flash sales, for the home page strip (§3.4). */
  @Get('flash-sale')
  flashSale() {
    return this.products.flashSale();
  }

  /** Product videos, newest first, for the storefront Feed (§2.5). */
  @Get('feed')
  feed(@Query() query: FeedQuery) {
    return this.products.feed(query);
  }

  /** Product slugs are unique per shop, so the shop slug is part of the path. */
  @Get(':shopSlug/:slug')
  findOne(@Param('shopSlug') shopSlug: string, @Param('slug') slug: string) {
    return this.products.findBySlug(shopSlug, slug);
  }
}

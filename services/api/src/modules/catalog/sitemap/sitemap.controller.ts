import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SitemapService } from './sitemap.service.js';

@ApiTags('catalog')
@Controller('sitemap')
export class SitemapController {
  constructor(private readonly sitemap: SitemapService) {}

  /** Public pages for search engines; the storefront turns this into /sitemap.xml. */
  @Get()
  entries() {
    return this.sitemap.entries();
  }
}

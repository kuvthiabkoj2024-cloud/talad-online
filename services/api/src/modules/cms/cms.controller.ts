import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AdminUser } from '../../generated/prisma/client.js';
import { AdminAuthGuard, CurrentAdmin, Permission } from '../auth/admin-auth.guard.js';
import { CmsPageDto, PlatformSettingsDto } from './cms.dto.js';
import { CmsService } from './cms.service.js';

/** Public: legal/help pages and the settings storefront checkout needs. */
@ApiTags('cms')
@Controller()
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  @Get('pages/:slug')
  page(@Param('slug') slug: string) {
    return this.cms.page(slug);
  }

  @Get('settings/public')
  settings() {
    return this.cms.publicSettings();
  }
}

/** Content pages and platform settings (§2.11). Super Admin only. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin')
export class AdminCmsController {
  constructor(private readonly cms: CmsService) {}

  @Permission('pages')
  @Get('pages')
  pages() {
    return this.cms.pages();
  }

  @Permission('pages')
  @Put('pages/:slug')
  savePage(@CurrentAdmin() a: AdminUser, @Param('slug') slug: string, @Body() dto: CmsPageDto) {
    return this.cms.savePage(a, slug, dto);
  }

  @Permission('settings')
  @Get('settings')
  settings() {
    return this.cms.settings();
  }

  @Permission('settings')
  @Put('settings')
  saveSettings(@CurrentAdmin() a: AdminUser, @Body() dto: PlatformSettingsDto) {
    return this.cms.saveSettings(a, dto);
  }
}

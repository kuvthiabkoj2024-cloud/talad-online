import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { MEDIA_LIMITS } from '@talad/shared';
import type { AdminUser } from '../../generated/prisma/client.js';
import { AdminAuthGuard, CurrentAdmin, Permission } from '../auth/admin-auth.guard.js';
import { AdminMediaService } from '../media/admin-media.service.js';
import { AdminCategoryDto, AdminUnitDto } from './admin-catalog.dto.js';
import { AdminCatalogService } from './admin-catalog.service.js';

const id = new ParseUUIDPipe({ version: '7' });

/** Categories, units and platform media uploads (§2.6, §2.8). Super Admin only. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Permission('catalog')
@Controller('admin')
export class AdminCatalogController {
  constructor(
    private readonly catalog: AdminCatalogService,
    private readonly media: AdminMediaService,
  ) {}

  @Get('categories')
  categories() {
    return this.catalog.categories();
  }

  @Post('categories')
  createCategory(@CurrentAdmin() a: AdminUser, @Body() dto: AdminCategoryDto) {
    return this.catalog.saveCategory(a, null, dto);
  }

  @Put('categories/:id')
  updateCategory(@CurrentAdmin() a: AdminUser, @Param('id', id) categoryId: string, @Body() dto: AdminCategoryDto) {
    return this.catalog.saveCategory(a, categoryId, dto);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  deleteCategory(@CurrentAdmin() a: AdminUser, @Param('id', id) categoryId: string) {
    return this.catalog.deleteCategory(a, categoryId);
  }

  @Get('units')
  units() {
    return this.catalog.units();
  }

  @Post('units')
  createUnit(@CurrentAdmin() a: AdminUser, @Body() dto: AdminUnitDto) {
    return this.catalog.saveUnit(a, null, dto);
  }

  @Put('units/:id')
  updateUnit(@CurrentAdmin() a: AdminUser, @Param('id', id) unitId: string, @Body() dto: AdminUnitDto) {
    return this.catalog.saveUnit(a, unitId, dto);
  }

  @Delete('units/:id')
  @HttpCode(204)
  deleteUnit(@CurrentAdmin() a: AdminUser, @Param('id', id) unitId: string) {
    return this.catalog.deleteUnit(a, unitId);
  }

  /** Public image for banners and category icons (PNG/JPG/WebP ≤ 5 MB) → `{ url }`. */
  @Post('uploads')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MEDIA_LIMITS.maxImageBytes } }))
  upload(@UploadedFile() file?: Express.Multer.File) {
    return this.media.uploadImage(file);
  }
}

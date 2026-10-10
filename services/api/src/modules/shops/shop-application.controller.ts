import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SHOP_RULES } from '@talad/shared';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { ShopApplicationDto } from './shop-application.dto.js';
import { ShopApplicationService } from './shop-application.service.js';

/** Applying to open a shop with the signed-in account (§3.1). */
@ApiTags('seller')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/shop/application')
export class ShopApplicationController {
  constructor(private readonly applications: ShopApplicationService) {}

  @Get()
  get(@CurrentCustomer() c: Customer) {
    return this.applications.get(c.id);
  }

  /** `?slug=my-shop` → whether that storefront address is free. */
  @Get('slug')
  slug(@CurrentCustomer() c: Customer, @Query('slug') slug = '') {
    return this.applications.slugAvailable(c.id, slug.slice(0, 64));
  }

  /** Upload an ID card, licence or certificate (JPG/PNG/WebP/PDF, ≤ 5 MB); attach it by key. */
  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: SHOP_RULES.kycMaxBytes } }))
  upload(@CurrentCustomer() c: Customer, @UploadedFile() file?: Express.Multer.File) {
    return this.applications.uploadDocument(c.id, file);
  }

  @Get('documents/:id')
  async document(@CurrentCustomer() c: Customer, @Param('id', new ParseUUIDPipe({ version: '7' })) id: string) {
    const file = await this.applications.document(c.id, id);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength, disposition: 'inline' });
  }

  @Post()
  create(@CurrentCustomer() c: Customer, @Body() dto: ShopApplicationDto) {
    return this.applications.create(c, dto);
  }

  @Put()
  update(@CurrentCustomer() c: Customer, @Body() dto: ShopApplicationDto) {
    return this.applications.update(c, dto);
  }
}

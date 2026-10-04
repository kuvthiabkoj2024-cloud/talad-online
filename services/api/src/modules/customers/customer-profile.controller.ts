import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { CUSTOMER_LIMITS } from '@talad/shared';
import type { Customer } from '../../generated/prisma/client.js';
import { CurrentCustomer, CustomerAuthGuard } from '../auth/customer-auth.guard.js';
import { AddressesService } from './addresses.service.js';
import { BankAccountsService } from './bank-accounts.service.js';
import { AddressDto, BankAccountDto, ProfileDto } from './dto/customer-profile.dto.js';
import { ProfileService } from './profile.service.js';

const id = new ParseUUIDPipe({ version: '7' });

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentCustomer() c: Customer) {
    return this.addresses.list(c.id);
  }

  @Post()
  create(@CurrentCustomer() c: Customer, @Body() dto: AddressDto) {
    return this.addresses.create(c.id, dto);
  }

  @Put(':id')
  update(@CurrentCustomer() c: Customer, @Param('id', id) addressId: string, @Body() dto: AddressDto) {
    return this.addresses.update(c.id, addressId, dto);
  }

  @Post(':id/default')
  @HttpCode(200)
  setDefault(@CurrentCustomer() c: Customer, @Param('id', id) addressId: string) {
    return this.addresses.setDefault(c.id, addressId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentCustomer() c: Customer, @Param('id', id) addressId: string) {
    return this.addresses.remove(c.id, addressId);
  }
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/bank-accounts')
export class BankAccountsController {
  constructor(private readonly accounts: BankAccountsService) {}

  @Get()
  list(@CurrentCustomer() c: Customer) {
    return this.accounts.list(c.id);
  }

  /** Multipart field `file`: PNG, JPG or WebP up to 2 MB. Returns `{ qrImageKey }`. */
  @Post('qr')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CUSTOMER_LIMITS.qrMaxBytes, files: 1 } }))
  uploadQr(@CurrentCustomer() c: Customer, @UploadedFile() file?: Express.Multer.File) {
    return this.accounts.uploadQr(c.id, file);
  }

  /** The QR image itself — only ever served to its owner. */
  @Get(':id/qr')
  async qr(@CurrentCustomer() c: Customer, @Param('id', id) accountId: string) {
    const file = await this.accounts.qr(c.id, accountId);
    return new StreamableFile(file.body, {
      type: file.contentType,
      length: file.contentLength,
      disposition: 'inline',
    });
  }

  @Post()
  create(@CurrentCustomer() c: Customer, @Body() dto: BankAccountDto) {
    return this.accounts.create(c.id, dto);
  }

  @Put(':id')
  update(@CurrentCustomer() c: Customer, @Param('id', id) accountId: string, @Body() dto: BankAccountDto) {
    return this.accounts.update(c.id, accountId, dto);
  }

  @Post(':id/default')
  @HttpCode(200)
  setDefault(@CurrentCustomer() c: Customer, @Param('id', id) accountId: string) {
    return this.accounts.setDefault(c.id, accountId);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentCustomer() c: Customer, @Param('id', id) accountId: string) {
    return this.accounts.remove(c.id, accountId);
  }
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Put('profile')
  update(@CurrentCustomer() c: Customer, @Body() dto: ProfileDto) {
    return this.profile.update(c.id, dto);
  }

  /** Multipart field `file`: PNG, JPG or WebP up to 2 MB. Returns the updated profile. */
  @Post('avatar')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CUSTOMER_LIMITS.qrMaxBytes, files: 1 } }))
  uploadAvatar(@CurrentCustomer() c: Customer, @UploadedFile() file?: Express.Multer.File) {
    return this.profile.setAvatar(c.id, file);
  }

  @Delete('avatar')
  removeAvatar(@CurrentCustomer() c: Customer) {
    return this.profile.removeAvatar(c.id);
  }
}

/** Public profile photos. URLs carry ?v=<version>, so responses can be cached for long. */
@ApiTags('customers')
@SkipThrottle()
@Controller('avatars')
export class AvatarsController {
  constructor(private readonly profile: ProfileService) {}

  @Get(':customerId')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async avatar(@Param('customerId', id) customerId: string) {
    const file = await this.profile.avatar(customerId);
    return new StreamableFile(file.body, { type: file.contentType, length: file.contentLength });
  }
}

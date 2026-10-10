import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AdminUser } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminAuthGuard, CurrentAdmin, Roles } from '../auth/admin-auth.guard.js';
import { BannerDto } from './banner.dto.js';
import { BannersService } from './banners.service.js';
import { CouponActiveDto, ShopCouponDto } from './shop-coupon.dto.js';
import { ShopCouponsService } from './shop-coupons.service.js';

const id = new ParseUUIDPipe({ version: '7' });

/** Public: the landing-page banners running now. */
@ApiTags('catalog')
@Controller('banners')
export class BannersController {
  constructor(private readonly banners: BannersService) {}

  @Get()
  active() {
    return this.banners.active();
  }
}

/** Platform banners and platform-wide coupons (§2.8). Super Admin only. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminPromotionsController {
  constructor(
    private readonly banners: BannersService,
    private readonly coupons: ShopCouponsService,
    private readonly audit: AuditService,
  ) {}

  @Get('banners')
  listBanners() {
    return this.banners.list();
  }

  @Post('banners')
  createBanner(@CurrentAdmin() a: AdminUser, @Body() dto: BannerDto) {
    return this.banners.save(a, null, dto);
  }

  @Put('banners/:id')
  updateBanner(@CurrentAdmin() a: AdminUser, @Param('id', id) bannerId: string, @Body() dto: BannerDto) {
    return this.banners.save(a, bannerId, dto);
  }

  @Delete('banners/:id')
  @HttpCode(204)
  deleteBanner(@CurrentAdmin() a: AdminUser, @Param('id', id) bannerId: string) {
    return this.banners.remove(a, bannerId);
  }

  @Get('coupons')
  listCoupons() {
    return this.coupons.list(null);
  }

  @Post('coupons')
  async createCoupon(@CurrentAdmin() a: AdminUser, @Body() dto: ShopCouponDto) {
    const c = await this.coupons.create(null, dto);
    await this.audit.log({ adminId: a.id, action: 'coupon.create', entityType: 'Coupon', entityId: c.id, changes: { code: c.code } });
    return c;
  }

  @Put('coupons/:id')
  async updateCoupon(@CurrentAdmin() a: AdminUser, @Param('id', id) couponId: string, @Body() dto: ShopCouponDto) {
    const c = await this.coupons.update(null, couponId, dto);
    await this.audit.log({ adminId: a.id, action: 'coupon.update', entityType: 'Coupon', entityId: couponId, changes: { code: c.code } });
    return c;
  }

  @Patch('coupons/:id')
  async setCouponActive(@CurrentAdmin() a: AdminUser, @Param('id', id) couponId: string, @Body() dto: CouponActiveDto) {
    const c = await this.coupons.setActive(null, couponId, dto.isActive);
    await this.audit.log({ adminId: a.id, action: 'coupon.active', entityType: 'Coupon', entityId: couponId, changes: { isActive: dto.isActive } });
    return c;
  }

  @Delete('coupons/:id')
  @HttpCode(204)
  async deleteCoupon(@CurrentAdmin() a: AdminUser, @Param('id', id) couponId: string) {
    await this.coupons.remove(null, couponId);
    await this.audit.log({ adminId: a.id, action: 'coupon.delete', entityType: 'Coupon', entityId: couponId });
  }
}

import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ADMIN_ROLES, type AdminRole } from '@talad/shared';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { Request } from 'express';
import type { AdminUser } from '../../generated/prisma/client.js';
import { AuditService } from '../audit/audit.service.js';
import { AdminAuthGuard, AdminToken, CurrentAdmin, Roles } from '../auth/admin-auth.guard.js';
import { ADMIN_PASSWORD_MIN, AdminAuthService, toProfile } from './admin-auth.service.js';

class AdminLoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(200)
  password: string;
}

class ChangePasswordDto {
  @IsString()
  current: string;

  @IsString()
  @MinLength(ADMIN_PASSWORD_MIN)
  @MaxLength(200)
  next: string;
}

class TwoFactorDto {
  @IsString()
  @IsNotEmpty()
  challenge: string;

  @Matches(/^\d{6}$/)
  code: string;
}

class CodeDto {
  @Matches(/^\d{6}$/)
  code: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

class ResetPasswordDto {
  @IsString()
  @Length(20, 100)
  token: string;

  @IsString()
  @MinLength(ADMIN_PASSWORD_MIN)
  @MaxLength(200)
  password: string;
}

class CreateAdminDto {
  @IsEmail()
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 100)
  name: string;

  @IsIn(ADMIN_ROLES)
  role: AdminRole;

  @IsString()
  @MinLength(ADMIN_PASSWORD_MIN)
  @MaxLength(200)
  password: string;
}

class UpdateAdminDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsIn(ADMIN_ROLES)
  role?: AdminRole;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(ADMIN_PASSWORD_MIN)
  @MaxLength(200)
  password?: string;

  /** Clears the authenticator (lost phone); the admin is signed out everywhere. */
  @IsOptional()
  @IsBoolean()
  resetTwoFactor?: boolean;
}

class AuditQuery {
  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  @IsString()
  adminId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 30;
}

const client = (req: Request) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

@ApiTags('admin')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, client(req));
  }

  /** Second step for admins with an authenticator app. */
  @Post('2fa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyTwoFactor(@Body() dto: TwoFactorDto, @Req() req: Request) {
    return this.auth.verifyTwoFactor(dto.challenge, dto.code, client(req));
  }

  @Post('password/forgot')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @Post('password/reset')
  @HttpCode(204)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.password);
  }

  @Post('2fa/setup')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  totpSetup(@CurrentAdmin() admin: AdminUser) {
    return this.auth.totpSetup(admin);
  }

  @Post('2fa/enable')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  totpEnable(@CurrentAdmin() admin: AdminUser, @Body() dto: CodeDto) {
    return this.auth.totpEnable(admin, dto.code);
  }

  @Post('2fa/disable')
  @HttpCode(200)
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  totpDisable(@CurrentAdmin() admin: AdminUser, @Body() dto: CodeDto) {
    return this.auth.totpDisable(admin, dto.code);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  me(@CurrentAdmin() admin: AdminUser) {
    return toProfile(admin);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async logout(@AdminToken() token: string) {
    await this.auth.logout(token);
  }

  @Post('password')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async changePassword(@CurrentAdmin() admin: AdminUser, @AdminToken() token: string, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(admin, token, dto.current, dto.next);
  }
}

/** Staff accounts and the audit log — Super Admin only (§2.1). */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminUsersController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly audit: AuditService,
  ) {}

  @Get('admins')
  list() {
    return this.auth.list();
  }

  @Post('admins')
  create(@CurrentAdmin() admin: AdminUser, @Body() dto: CreateAdminDto) {
    return this.auth.create(admin, dto);
  }

  @Patch('admins/:id')
  update(@CurrentAdmin() admin: AdminUser, @Param('id', new ParseUUIDPipe({ version: '7' })) id: string, @Body() dto: UpdateAdminDto) {
    return this.auth.update(admin, id, dto);
  }

  /** `?entityType=Shop&entityId=…&adminId=…&page=1` */
  @Get('audit-log')
  auditLog(@Query() q: AuditQuery) {
    return this.audit.list(q);
  }
}

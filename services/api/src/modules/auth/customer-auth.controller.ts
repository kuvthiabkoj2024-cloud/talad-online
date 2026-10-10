import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Customer } from '../../generated/prisma/client.js';
import { CustomerAuthGuard, CurrentCustomer, SessionToken } from './customer-auth.guard.js';
import { CustomerAuthService } from './customer-auth.service.js';
import {
  ForgotPasswordDto,
  PasswordLoginDto,
  RequestOtpDto,
  ResetPasswordDto,
  SocialSignInDto,
  TwoFactorChallengeDto,
  TwoFactorVerifyDto,
  VerifyOtpDto,
} from './dto/customer-auth.dto.js';
import type { ClientInfo } from './session.service.js';

const clientInfo = (req: Request): ClientInfo => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});

@ApiTags('auth')
@Controller('auth/customer')
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService) {}

  /** Step 1 of phone sign-in / sign-up: send an SMS code. */
  @Post('otp/request')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.auth.requestOtp(dto);
  }

  /** Step 2: exchange the SMS code for a session. */
  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.auth.verifyOtp(dto, clientInfo(req));
  }

  /** Phone or email + password; returns a session, or a `twoFactor` challenge. */
  @Post('password/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  passwordLogin(@Body() dto: PasswordLoginDto, @Req() req: Request) {
    return this.auth.passwordLogin(dto, clientInfo(req));
  }

  @Post('password/forgot')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('password/reset')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
  }

  /** Second step of sign-in for accounts with 2FA. */
  @Post('2fa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyTwoFactor(@Body() dto: TwoFactorVerifyDto, @Req() req: Request) {
    return this.auth.verifyTwoFactor(dto, clientInfo(req));
  }

  @Post('2fa/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resendTwoFactor(@Body() dto: TwoFactorChallengeDto) {
    return this.auth.resendTwoFactor(dto.challenge);
  }

  @Post('google')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  google(@Body() dto: SocialSignInDto, @Req() req: Request) {
    return this.auth.socialSignIn('google', dto, clientInfo(req));
  }

  @Post('apple')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  apple(@Body() dto: SocialSignInDto, @Req() req: Request) {
    return this.auth.socialSignIn('apple', dto, clientInfo(req));
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  me(@CurrentCustomer() customer: Customer) {
    return this.auth.profile(customer.id);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiBearerAuth()
  @UseGuards(CustomerAuthGuard)
  async logout(@SessionToken() token: string) {
    await this.auth.logout(token);
  }
}

import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Customer } from '../../generated/prisma/client.js';
import { CustomerAuthGuard, CurrentCustomer, SessionToken } from './customer-auth.guard.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { RequestOtpDto, SocialSignInDto, VerifyOtpDto } from './dto/customer-auth.dto.js';
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

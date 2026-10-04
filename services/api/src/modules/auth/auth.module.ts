import { Module } from '@nestjs/common';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthGuard } from './customer-auth.guard.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';
import { SmsService } from './sms.service.js';
import { SocialIdentityService } from './social-identity.service.js';

/** Login, sessions, 2FA (TOTP/SMS) and password reset for admin, shop and customer actors (§2.1, §3.1, §4.1). */
@Module({
  controllers: [CustomerAuthController],
  providers: [
    CustomerAuthService,
    CustomerAuthGuard,
    OtpService,
    SessionService,
    SmsService,
    SocialIdentityService,
  ],
  exports: [CustomerAuthGuard, SessionService],
})
export class AuthModule {}

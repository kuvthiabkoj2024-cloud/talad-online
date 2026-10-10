import { Module } from '@nestjs/common';
import { AccountSecurityController, AccountSecurityService } from './account-security.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { CustomerAuthController } from './customer-auth.controller.js';
import { CustomerAuthGuard } from './customer-auth.guard.js';
import { CustomerAuthService } from './customer-auth.service.js';
import { EmailService } from './email.service.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';
import { SessionsController } from './sessions.controller.js';
import { ShopOwnerGuard } from './shop-owner.guard.js';
import { SmsService } from './sms.service.js';
import { SocialIdentityService } from './social-identity.service.js';

/** Login, sessions, 2FA (TOTP/SMS) and password reset for admin, shop and customer actors (§2.1, §3.1, §4.1). */
@Module({
  controllers: [CustomerAuthController, SessionsController, AccountSecurityController],
  providers: [
    AccountSecurityService,
    AdminAuthGuard,
    CustomerAuthService,
    CustomerAuthGuard,
    EmailService,
    OtpService,
    SessionService,
    ShopOwnerGuard,
    SmsService,
    SocialIdentityService,
  ],
  exports: [AdminAuthGuard, CustomerAuthGuard, EmailService, SessionService, ShopOwnerGuard],
})
export class AuthModule {}

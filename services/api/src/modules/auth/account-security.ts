import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, Post, Put, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import argon2 from 'argon2';
import QRCode from 'qrcode';
import type { Env } from '../../config/env.validation.js';
import type { Customer } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authError } from './auth-errors.js';
import { CurrentCustomer, CustomerAuthGuard, SessionToken } from './customer-auth.guard.js';
import { CodeDto, SetPasswordDto } from './dto/customer-auth.dto.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';
import { SmsService } from './sms.service.js';
import { generateTotpSecret, totpUri, verifyTotp } from './totp.js';

export interface SecurityStatus {
  hasPassword: boolean;
  twoFactor: Customer['twoFactorMethod'];
  phone: string | null;
  email: string | null;
}

const status = (c: Customer): SecurityStatus => ({ hasPassword: c.passwordHash !== null, twoFactor: c.twoFactorMethod, phone: c.phone, email: c.email });

/** Password and two-factor settings for the signed-in account (§3.1, §4.1). */
@Injectable()
export class AccountSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  status(c: Customer): SecurityStatus {
    return status(c);
  }

  /** Sets or changes the password; other devices are signed out. */
  async setPassword(c: Customer, token: string, dto: SetPasswordDto): Promise<SecurityStatus> {
    if (c.passwordHash && !(dto.current && (await argon2.verify(c.passwordHash, dto.current)))) {
      throw new BadRequestException(authError('WRONG_PASSWORD', 'The current password is wrong'));
    }
    const saved = await this.prisma.customer.update({ where: { id: c.id }, data: { passwordHash: await argon2.hash(dto.password) } });
    await this.sessions.revokeFor('CUSTOMER', c.id, token);
    return status(saved);
  }

  /** A new authenticator secret (not active until confirmed with a code). */
  async totpSetup(c: Customer) {
    if (c.twoFactorMethod === 'TOTP') throw new ConflictException(authError('TWO_FACTOR_INVALID', 'Turn off the authenticator first'));
    const secret = generateTotpSecret();
    await this.prisma.customer.update({ where: { id: c.id }, data: { totpSecret: secret } });
    const uri = totpUri(secret, c.phone ?? c.email ?? c.name);
    return { secret, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
  }

  async totpEnable(c: Customer, code: string): Promise<SecurityStatus> {
    if (!c.totpSecret) throw new BadRequestException(authError('TOTP_NOT_SET_UP', 'Set up the authenticator first'));
    if (!verifyTotp(c.totpSecret, code)) throw new BadRequestException(authError('TWO_FACTOR_INVALID', 'Incorrect code'));
    return status(await this.prisma.customer.update({ where: { id: c.id }, data: { twoFactorMethod: 'TOTP' } }));
  }

  async smsEnable(c: Customer): Promise<SecurityStatus> {
    if (!c.phone || !c.phoneVerifiedAt) throw new BadRequestException(authError('PHONE_REQUIRED', 'Add and verify a phone number first'));
    if (c.twoFactorMethod === 'TOTP') throw new ConflictException(authError('TWO_FACTOR_INVALID', 'Turn off the authenticator first'));
    return status(await this.prisma.customer.update({ where: { id: c.id }, data: { twoFactorMethod: 'SMS' } }));
  }

  /** For turning SMS 2FA off: a code to the account's phone. */
  async sendCode(c: Customer) {
    if (!c.phone) throw new BadRequestException(authError('PHONE_REQUIRED', 'No phone number on this account'));
    const { code, expiresAt } = await this.otp.create(c.phone, 'customer_2fa');
    await this.sms.send(c.phone, `Taladonline: your security code is ${code}. It expires in 5 minutes.`);
    const dev = this.config.get('NODE_ENV', { infer: true }) !== 'production';
    return { expiresAt, resendAfterSeconds: 60, ...(dev && { devCode: code }) };
  }

  /** Turns 2FA off, confirmed with a code from the current method. */
  async disable(c: Customer, code: string): Promise<SecurityStatus> {
    if (c.twoFactorMethod === 'TOTP') {
      if (!c.totpSecret || !verifyTotp(c.totpSecret, code)) throw new BadRequestException(authError('TWO_FACTOR_INVALID', 'Incorrect code'));
    } else if (c.twoFactorMethod === 'SMS') {
      await this.otp.verify(c.phone!, 'customer_2fa', code);
    }
    return status(await this.prisma.customer.update({ where: { id: c.id }, data: { twoFactorMethod: 'NONE', totpSecret: null } }));
  }
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(CustomerAuthGuard)
@Controller('me/security')
export class AccountSecurityController {
  constructor(private readonly security: AccountSecurityService) {}

  @Get()
  get(@CurrentCustomer() c: Customer) {
    return this.security.status(c);
  }

  @Put('password')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  setPassword(@CurrentCustomer() c: Customer, @SessionToken() token: string, @Body() dto: SetPasswordDto) {
    return this.security.setPassword(c, token, dto);
  }

  @Post('totp/setup')
  @HttpCode(200)
  totpSetup(@CurrentCustomer() c: Customer) {
    return this.security.totpSetup(c);
  }

  @Post('totp/enable')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  totpEnable(@CurrentCustomer() c: Customer, @Body() dto: CodeDto) {
    return this.security.totpEnable(c, dto.code);
  }

  @Post('sms/enable')
  @HttpCode(200)
  smsEnable(@CurrentCustomer() c: Customer) {
    return this.security.smsEnable(c);
  }

  @Post('code')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  sendCode(@CurrentCustomer() c: Customer) {
    return this.security.sendCode(c);
  }

  @Post('2fa/disable')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  disable(@CurrentCustomer() c: Customer, @Body() dto: CodeDto) {
    return this.security.disable(c, dto.code);
  }
}

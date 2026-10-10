import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OTP_LENGTH } from '@talad/shared';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authError } from './auth-errors.js';

const CODE_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpPurpose = 'customer_login' | 'customer_register' | 'customer_reset' | 'customer_2fa';

/** One-time SMS codes, keyed by phone number (the customer may not exist yet). */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Creates a fresh code (invalidating earlier ones) and returns it for delivery. */
  async create(phone: string, purpose: OtpPurpose): Promise<{ code: string; expiresAt: Date }> {
    const latest = await this.prisma.oneTimeCode.findFirst({
      where: { actorType: 'CUSTOMER', actorId: phone, purpose },
      orderBy: { createdAt: 'desc' },
    });
    if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
      const retryAfter = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - latest.createdAt.getTime())) / 1000,
      );
      throw new HttpException(
        authError('OTP_COOLDOWN', `Wait ${retryAfter}s before requesting a new code`, { retryAfter }),
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);
    await this.prisma.$transaction([
      this.prisma.oneTimeCode.updateMany({
        where: { actorType: 'CUSTOMER', actorId: phone, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.oneTimeCode.create({
        data: {
          actorType: 'CUSTOMER',
          actorId: phone,
          purpose,
          codeHash: this.hash(phone, code),
          expiresAt,
        },
      }),
    ]);
    return { code, expiresAt };
  }

  /** Consumes the code; throws a typed auth error when it is wrong, expired or burned. */
  async verify(phone: string, purpose: OtpPurpose, code: string): Promise<void> {
    const otp = await this.prisma.oneTimeCode.findFirst({
      where: {
        actorType: 'CUSTOMER',
        actorId: phone,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.attempts >= MAX_ATTEMPTS) {
      throw new HttpException(authError('OTP_EXPIRED', 'Code expired, request a new one'), HttpStatus.BAD_REQUEST);
    }

    const expected = Buffer.from(otp.codeHash, 'hex');
    const actual = Buffer.from(this.hash(phone, code), 'hex');
    if (!timingSafeEqual(expected, actual)) {
      await this.prisma.oneTimeCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new HttpException(authError('OTP_INVALID', 'Incorrect code'), HttpStatus.BAD_REQUEST);
    }

    await this.prisma.oneTimeCode.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });
  }

  private hash(phone: string, code: string): string {
    return createHmac('sha256', this.config.get('JWT_ACCESS_SECRET', { infer: true }))
      .update(`${phone}:${code}`)
      .digest('hex');
  }
}

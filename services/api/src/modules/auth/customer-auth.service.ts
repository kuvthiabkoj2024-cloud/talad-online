import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatPhone, normalizePhone } from '@talad/shared';
import argon2 from 'argon2';
import type { Env } from '../../config/env.validation.js';
import { Prisma, type Customer, type ShopStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authError } from './auth-errors.js';
import type {
  ForgotPasswordDto,
  OtpFlow,
  PasswordLoginDto,
  RequestOtpDto,
  ResetPasswordDto,
  SocialSignInDto,
  TwoFactorVerifyDto,
  VerifyOtpDto,
} from './dto/customer-auth.dto.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { OtpService, type OtpPurpose } from './otp.service.js';
import { SessionService, type ClientInfo } from './session.service.js';
import { SmsService } from './sms.service.js';
import { SocialIdentityService, type SocialProvider } from './social-identity.service.js';
import { CHALLENGE_TTL_MS, readChallenge, signChallenge } from './challenge.js';
import { verifyTotp } from './totp.js';

export interface CustomerProfile {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  /** External photo (e.g. from Google), used when no photo was uploaded. */
  avatarUrl: string | null;
  /** Set when the customer uploaded a photo; served at GET /avatars/:id?v=<version>. */
  avatarVersion: string | null;
  createdAt: Date;
  linked: { google: boolean; apple: boolean };
  /** The shop this account owns (accounts can buy and sell), or null. */
  shop: { id: string; slug: string; name: string; status: ShopStatus } | null;
}

/** Include this whenever a customer is loaded to build a profile. */
export const withShop = {
  shop: { select: { id: true, slug: true, name: true, status: true } },
} satisfies Prisma.CustomerInclude;

export type CustomerWithShop = Prisma.CustomerGetPayload<{ include: typeof withShop }>;

/** Uploaded avatars are stored under this key prefix in `Customer.avatarUrl`. */
export const avatarPrefix = (customerId: string) => filePrefix(storageFolder.customerProfile(customerId), 'avatar');

export interface CustomerSignIn {
  token: string;
  expiresAt: Date;
  customer: CustomerProfile;
}

/** Step one passed; the client must send a code (`POST auth/customer/2fa/verify`) to get a session. */
export interface TwoFactorChallenge {
  twoFactor: {
    method: 'TOTP' | 'SMS';
    challenge: string;
    expiresAt: Date;
    /** Where the SMS went, e.g. "+856 20 ••• 1234". */
    phoneHint: string | null;
    /** SMS only, outside production. */
    devCode?: string;
  };
}

export type SignInResult = CustomerSignIn | TwoFactorChallenge;

/** Compared against when the account doesn't exist, so timing doesn't reveal which accounts do. */
const DUMMY_HASH = argon2.hash('not-a-real-password');

const PURPOSE: Record<OtpFlow, OtpPurpose> = {
  login: 'customer_login',
  register: 'customer_register',
};

export function toProfile(c: CustomerWithShop): CustomerProfile {
  const stored = c.avatarUrl?.startsWith(avatarPrefix(c.id)) ?? false;
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    avatarUrl: stored ? null : c.avatarUrl,
    // The object name is a fresh UUID per upload, so it doubles as a cache-busting version.
    avatarVersion: stored ? c.avatarUrl!.slice(avatarPrefix(c.id).length).split('.')[0] : null,
    createdAt: c.createdAt,
    linked: { google: c.googleId !== null, apple: c.appleId !== null },
    shop: c.shop,
  };
}

/** Customer sign-up / sign-in: phone + SMS code, or Google / Apple (§4.1). */
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
    private readonly sessions: SessionService,
    private readonly social: SocialIdentityService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Sends a sign-in code. Outside production the code is also returned, for testing without SMS. */
  async requestOtp(dto: RequestOtpDto) {
    const phone = this.phone(dto.phone);
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    this.assertFlow(dto.flow, existing, dto.name);

    const { code, expiresAt } = await this.otp.create(phone, PURPOSE[dto.flow]);
    await this.sms.send(phone, `Taladonline: your verification code is ${code}. It expires in 5 minutes.`);

    return { phone, expiresAt, resendAfterSeconds: 60, ...(this.dev() && { devCode: code }) };
  }

  async verifyOtp(dto: VerifyOtpDto, client: ClientInfo): Promise<SignInResult> {
    const phone = this.phone(dto.phone);
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    this.assertFlow(dto.flow, existing, dto.name);

    await this.otp.verify(phone, PURPOSE[dto.flow], dto.code);

    const customer = existing
      ? await this.prisma.customer.update({
          where: { id: existing.id },
          data: { phoneVerifiedAt: existing.phoneVerifiedAt ?? new Date() },
        })
      : await this.createCustomer({ name: dto.name!.trim(), phone, phoneVerifiedAt: new Date() });

    // The SMS code already proves the phone; an authenticator app is the only extra step here.
    if (customer.twoFactorMethod === 'TOTP' && customer.totpSecret) {
      this.assertActive(customer);
      return this.challenge(customer, 'TOTP');
    }
    return this.signIn(customer, client);
  }

  /** Sign in with phone or email + password (§3.1); accounts with 2FA get a challenge instead of a session. */
  async passwordLogin(dto: PasswordLoginDto, client: ClientInfo): Promise<SignInResult> {
    const id = dto.identifier.trim();
    const phone = id.includes('@') ? null : normalizePhone(id);
    const customer = id.includes('@')
      ? await this.prisma.customer.findUnique({ where: { email: id.toLowerCase() } })
      : phone
        ? await this.prisma.customer.findUnique({ where: { phone } })
        : null;
    const valid = customer?.passwordHash
      ? await argon2.verify(customer.passwordHash, dto.password)
      : (await argon2.verify(await DUMMY_HASH, dto.password), false);
    if (!customer || !valid) {
      throw new UnauthorizedException(authError('INVALID_CREDENTIALS', 'Wrong phone/email or password'));
    }
    this.assertActive(customer);
    if (customer.twoFactorMethod === 'TOTP' && customer.totpSecret) return this.challenge(customer, 'TOTP');
    if (customer.twoFactorMethod === 'SMS' && customer.phone) return this.challenge(customer, 'SMS');
    return this.signIn(customer, client);
  }

  /** Step two: the authenticator or SMS code for a challenge. */
  async verifyTwoFactor(dto: TwoFactorVerifyDto, client: ClientInfo): Promise<CustomerSignIn> {
    const { customerId, method } = this.readChallenge(dto.challenge);
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw this.challengeExpired();
    if (method === 'TOTP') {
      if (!customer.totpSecret || !verifyTotp(customer.totpSecret, dto.code)) {
        throw new BadRequestException(authError('TWO_FACTOR_INVALID', 'Incorrect code'));
      }
    } else {
      if (!customer.phone) throw this.challengeExpired();
      await this.otp.verify(customer.phone, 'customer_2fa', dto.code);
    }
    return this.signIn(customer, client);
  }

  /** Sends a new SMS code for an SMS challenge. */
  async resendTwoFactor(challenge: string) {
    const { customerId, method } = this.readChallenge(challenge);
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (method !== 'SMS' || !customer?.phone) throw this.challengeExpired();
    return (await this.challenge(customer, 'SMS', challenge)).twoFactor;
  }

  /** Sends a reset code to the account's phone. */
  async forgotPassword(dto: ForgotPasswordDto) {
    const phone = this.phone(dto.phone);
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    this.assertFlow('login', existing);
    const { code, expiresAt } = await this.otp.create(phone, 'customer_reset');
    await this.sms.send(phone, `Taladonline: your password reset code is ${code}. It expires in 5 minutes.`);
    return { phone, expiresAt, resendAfterSeconds: 60, ...(this.dev() && { devCode: code }) };
  }

  /** Sets a new password with the SMS code; every device is signed out. */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const phone = this.phone(dto.phone);
    const existing = await this.prisma.customer.findUnique({ where: { phone } });
    this.assertFlow('login', existing);
    await this.otp.verify(phone, 'customer_reset', dto.code);
    await this.prisma.customer.update({
      where: { id: existing!.id },
      data: { passwordHash: await argon2.hash(dto.password), phoneVerifiedAt: existing!.phoneVerifiedAt ?? new Date() },
    });
    await this.sessions.revokeFor('CUSTOMER', existing!.id, '');
  }

  async socialSignIn(
    provider: SocialProvider,
    dto: SocialSignInDto,
    client: ClientInfo,
  ): Promise<SignInResult> {
    const identity = await this.social.verify(provider, dto.idToken);
    const idField = provider === 'google' ? 'googleId' : 'appleId';

    let customer =
      (await this.prisma.customer.findFirst({ where: { [idField]: identity.subject } })) ??
      // Link to an existing account only through a provider-verified email.
      (identity.email && identity.emailVerified
        ? await this.prisma.customer.findUnique({ where: { email: identity.email } })
        : null);

    if (customer) {
      if (!customer[idField]) {
        customer = await this.prisma.customer.update({
          where: { id: customer.id },
          data: { [idField]: identity.subject },
        });
      }
    } else {
      customer = await this.createCustomer({
        [idField]: identity.subject,
        name: dto.name?.trim() || identity.name || identity.email?.split('@')[0] || 'Customer',
        email: identity.emailVerified ? identity.email : null,
        avatarUrl: identity.picture,
      });
    }

    if (customer.twoFactorMethod === 'TOTP' && customer.totpSecret) {
      this.assertActive(customer);
      return this.challenge(customer, 'TOTP');
    }
    return this.signIn(customer, client);
  }

  async profile(customerId: string): Promise<CustomerProfile> {
    const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId }, include: withShop });
    return toProfile(customer);
  }

  logout(token: string) {
    return this.sessions.revoke(token);
  }

  private async signIn(customer: Customer, client: ClientInfo): Promise<CustomerSignIn> {
    this.assertActive(customer);
    const session = await this.sessions.issue('CUSTOMER', customer.id, client);
    return { ...session, customer: await this.profile(customer.id) };
  }

  private assertActive(customer: Customer) {
    if (!customer.isActive) {
      throw new ForbiddenException(authError('ACCOUNT_DISABLED', 'This account has been suspended'));
    }
  }

  private dev() {
    return this.config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  /** A signed, short-lived ticket for the second step; SMS challenges also send the code. */
  private async challenge(customer: Customer, method: 'TOTP' | 'SMS', existing?: string): Promise<TwoFactorChallenge> {
    let devCode: string | undefined;
    if (method === 'SMS') {
      const { code } = await this.otp.create(customer.phone!, 'customer_2fa');
      await this.sms.send(customer.phone!, `Taladonline: your sign-in code is ${code}. It expires in 5 minutes.`);
      if (this.dev()) devCode = code;
    }
    const expiresAt = existing ? new Date(this.readChallenge(existing).exp) : new Date(Date.now() + CHALLENGE_TTL_MS);
    const phoneHint = method === 'SMS' && customer.phone ? formatPhone(customer.phone).replace(/ \d{3,4} (\d{4})$/, ' ••• $1') : null;
    return { twoFactor: { method, challenge: existing ?? signChallenge(this.secret(), 'customer', customer.id, method, expiresAt), expiresAt, phoneHint, ...(devCode && { devCode }) } };
  }

  private readChallenge(challenge: string) {
    const read = readChallenge(this.secret(), 'customer', challenge);
    if (!read) throw this.challengeExpired();
    return { customerId: read.id, exp: read.exp, method: read.method };
  }

  private secret() {
    return this.config.get('JWT_ACCESS_SECRET', { infer: true });
  }

  private challengeExpired() {
    return new BadRequestException(authError('CHALLENGE_EXPIRED', 'Sign-in expired, start again'));
  }

  private async createCustomer(data: Prisma.CustomerCreateInput): Promise<Customer> {
    try {
      return await this.prisma.customer.create({ data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(authError('PHONE_REGISTERED', 'Account already exists'));
      }
      throw e;
    }
  }

  private phone(input: string): string {
    const phone = normalizePhone(input);
    if (!phone) {
      throw new BadRequestException(authError('INVALID_PHONE', 'Enter a valid Lao mobile number'));
    }
    return phone;
  }

  private assertFlow(flow: OtpFlow, existing: Customer | null, name?: string) {
    if (flow === 'register') {
      if (existing) {
        throw new ConflictException(
          authError('PHONE_REGISTERED', 'This number already has an account — sign in instead'),
        );
      }
      if (!name?.trim()) throw new BadRequestException('name is required to register');
    } else if (!existing) {
      throw new NotFoundException(
        authError('PHONE_NOT_REGISTERED', 'No account for this number — sign up first'),
      );
    }
  }
}

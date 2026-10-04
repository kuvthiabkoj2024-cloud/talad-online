import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizePhone } from '@talad/shared';
import type { Env } from '../../config/env.validation.js';
import { Prisma, type Customer, type ShopStatus } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { authError } from './auth-errors.js';
import type { OtpFlow, RequestOtpDto, SocialSignInDto, VerifyOtpDto } from './dto/customer-auth.dto.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { OtpService, type OtpPurpose } from './otp.service.js';
import { SessionService, type ClientInfo } from './session.service.js';
import { SmsService } from './sms.service.js';
import { SocialIdentityService, type SocialProvider } from './social-identity.service.js';

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

    const dev = this.config.get('NODE_ENV', { infer: true }) !== 'production';
    return { phone, expiresAt, resendAfterSeconds: 60, ...(dev && { devCode: code }) };
  }

  async verifyOtp(dto: VerifyOtpDto, client: ClientInfo): Promise<CustomerSignIn> {
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

    return this.signIn(customer, client);
  }

  async socialSignIn(
    provider: SocialProvider,
    dto: SocialSignInDto,
    client: ClientInfo,
  ): Promise<CustomerSignIn> {
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
    if (!customer.isActive) {
      throw new ForbiddenException(authError('ACCOUNT_DISABLED', 'This account has been suspended'));
    }
    const session = await this.sessions.issue('CUSTOMER', customer.id, client);
    return { ...session, customer: await this.profile(customer.id) };
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

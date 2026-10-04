import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../../config/env.validation.js';
import { authError } from './auth-errors.js';

export type SocialProvider = 'google' | 'apple';

export interface SocialIdentity {
  provider: SocialProvider;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

const PROVIDERS = {
  google: {
    jwks: createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs')),
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    clientIdEnv: 'GOOGLE_CLIENT_ID',
  },
  apple: {
    jwks: createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys')),
    issuer: ['https://appleid.apple.com'],
    clientIdEnv: 'APPLE_CLIENT_ID',
  },
} as const;

/** Verifies ID tokens from Google / Apple sign-in against the providers' public keys. */
@Injectable()
export class SocialIdentityService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  async verify(provider: SocialProvider, idToken: string): Promise<SocialIdentity> {
    const { jwks, issuer, clientIdEnv } = PROVIDERS[provider];
    const audience = this.config
      .get(clientIdEnv, { infer: true })
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    if (!audience?.length) {
      throw new HttpException(
        authError('PROVIDER_NOT_CONFIGURED', `${provider} sign-in is not configured`),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    try {
      const { payload } = await jwtVerify(idToken, jwks, { issuer: [...issuer], audience });
      const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
      return {
        provider,
        subject: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
        emailVerified,
        name: typeof payload.name === 'string' ? payload.name : null,
        picture: typeof payload.picture === 'string' ? payload.picture : null,
      };
    } catch {
      throw new UnauthorizedException(
        authError('PROVIDER_TOKEN_INVALID', `Invalid ${provider} sign-in token`),
      );
    }
  }
}

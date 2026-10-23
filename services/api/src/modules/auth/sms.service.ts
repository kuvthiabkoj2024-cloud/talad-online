import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PHONE_COUNTRY_CODE } from '@talad/shared';
import type { Env } from '../../config/env.validation.js';
import { authError } from './auth-errors.js';

const TELBIZ_API = 'https://api.telbiz.la/api/v1';
/** Used when the token response doesn't say how long it lasts. */
const DEFAULT_TOKEN_TTL_MS = 50 * 60_000;
const TIMEOUT_MS = 10_000;

/** "+8562055551234" → "2055551234", the number format Telbiz expects. */
export function telbizPhone(e164: string): string {
  return e164.startsWith(PHONE_COUNTRY_CODE) ? e164.slice(PHONE_COUNTRY_CODE.length) : e164.replace(/^\+/, '');
}

class TelbizError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Outbound SMS through the Telbiz gateway (scope §6: local telecom gateway). Without
 * TELBIZ_CLIENT_ID / TELBIZ_SECRETKEY, messages are only written to the log (development).
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly clientId: string;
  private readonly secret: string;
  private readonly production: boolean;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: ConfigService<Env, true>) {
    this.clientId = config.get('TELBIZ_CLIENT_ID', { infer: true }) ?? '';
    this.secret = config.get('TELBIZ_SECRETKEY', { infer: true }) ?? '';
    this.production = config.get('NODE_ENV', { infer: true }) === 'production';
    if (!this.configured && this.production) {
      this.logger.warn('TELBIZ_CLIENT_ID / TELBIZ_SECRETKEY are not set: SMS codes are only logged, not sent');
    }
  }

  private get configured(): boolean {
    return Boolean(this.clientId && this.secret);
  }

  /** Sends a one-time code message. Throws SMS_FAILED (503) when the gateway refuses it. */
  async send(phone: string, message: string): Promise<void> {
    if (!this.configured) {
      this.logger.log(`SMS to ${phone}: ${message}`);
      return;
    }
    try {
      await this.deliver(phone, message).catch(async (err: unknown) => {
        if (!(err instanceof TelbizError && err.status === 401)) throw err;
        // Expired or revoked token: get a new one and try once more.
        this.token = null;
        await this.deliver(phone, message);
      });
    } catch (err) {
      this.logger.error(`SMS to ${phone} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpException(
        authError('SMS_FAILED', 'The code could not be sent by SMS. Try again in a moment.'),
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!this.production) this.logger.log(`SMS to ${phone} sent through Telbiz: ${message}`);
  }

  private async deliver(phone: string, message: string): Promise<void> {
    const res = await this.call<{ response?: { success?: boolean; code?: string; message?: string } }>(
      '/smsservice/newtransaction',
      { Phone: telbizPhone(phone), Title: 'OTP', Message: message },
      await this.accessToken(),
    );
    if (res.response && res.response.success === false) {
      throw new TelbizError(200, res.response.code ?? 'FAILED', res.response.message ?? 'Telbiz refused the message');
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const res = await this.call<{ accessToken?: string; expiresIn?: number }>('/connect/token', {
      ClientID: this.clientId,
      Secret: this.secret,
      GrantType: 'client_credentials',
    });
    if (!res.accessToken) throw new TelbizError(401, 'NO_TOKEN', 'Telbiz returned no access token');
    // Renew a minute early so a token never expires mid-request.
    const ttl = typeof res.expiresIn === 'number' && res.expiresIn > 120 ? (res.expiresIn - 60) * 1000 : DEFAULT_TOKEN_TTL_MS;
    this.token = { value: res.accessToken, expiresAt: Date.now() + ttl };
    return res.accessToken;
  }

  private async call<T>(path: string, body: unknown, token?: string): Promise<T> {
    const res = await fetch(`${TELBIZ_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // Non-JSON error page; the status code below still tells us what happened.
    }
    if (!res.ok) {
      const code = typeof data.code === 'string' ? data.code : `HTTP_${res.status}`;
      const message = typeof data.message === 'string' ? data.message : text.slice(0, 200);
      throw new TelbizError(res.status, code, `${path}: ${code} ${message}`.trim());
    }
    return data as T;
  }
}

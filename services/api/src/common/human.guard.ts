import { BadRequestException, Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.validation.js';
import { clientIp } from './client-ip.js';

interface SiteverifyResponse {
  success: boolean;
  'error-codes'?: string[];
}

/**
 * Cloudflare Turnstile check for endpoints bots abuse: sending SMS codes, password sign-in,
 * password resets. Clients send the widget's token in `X-Turnstile-Token` (one use each).
 * Off while TURNSTILE_SECRET_KEY is unset; lets requests through if Cloudflare can't be reached
 * (rate limits still apply), so an outage there doesn't lock everyone out.
 */
@Injectable()
export class HumanGuard implements CanActivate {
  private readonly log = new Logger(HumanGuard.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = this.config.get('TURNSTILE_SECRET_KEY', { infer: true });
    if (!secret) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.headers['x-turnstile-token'];
    if (typeof token !== 'string' || !token) {
      throw new BadRequestException({ code: 'CAPTCHA_REQUIRED', message: 'Please confirm you are not a robot' });
    }

    const body = new URLSearchParams({ secret, response: token });
    const ip = clientIp(req);
    if (ip) body.set('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(5_000),
    }).catch((e: unknown) => {
      this.log.warn(`Turnstile unreachable, letting the request through: ${String(e)}`);
      return null;
    });
    if (!res) return true;
    const result = (await res.json().catch(() => null)) as SiteverifyResponse | null;
    if (!result) {
      this.log.warn(`Turnstile answered ${res.status} without a result, letting the request through`);
      return true;
    }
    if (!result.success) {
      throw new BadRequestException({ code: 'CAPTCHA_FAILED', message: 'Robot check failed, please try again' });
    }
    return true;
  }
}

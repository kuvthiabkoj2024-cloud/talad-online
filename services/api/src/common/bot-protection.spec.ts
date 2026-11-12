import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../config/env.validation.js';
import { clientInfo, clientIp } from './client-ip.js';
import { HumanGuard } from './human.guard.js';

const KEY = 'k'.repeat(64);
const req = (headers: Record<string, string>, ip = '172.18.0.5') => ({ headers, ip }) as unknown as Request;

describe('clientIp', () => {
  const before = process.env.INTERNAL_API_KEY;
  beforeEach(() => (process.env.INTERNAL_API_KEY = KEY));
  afterAll(() => (process.env.INTERNAL_API_KEY = before));

  it('uses the shopper IP our storefront server passes on', () => {
    const r = req({ 'x-internal-key': KEY, 'x-client-ip': '203.0.113.7', 'x-client-user-agent': 'Phone', 'user-agent': 'node' });
    expect(clientIp(r)).toBe('203.0.113.7');
    expect(clientInfo(r)).toEqual({ ip: '203.0.113.7', userAgent: 'Phone' });
  });

  it('ignores forwarded IPs without the right key', () => {
    expect(clientIp(req({ 'x-internal-key': 'wrong', 'x-client-ip': '203.0.113.7' }))).toBe('172.18.0.5');
    expect(clientIp(req({ 'x-client-ip': '203.0.113.7' }))).toBe('172.18.0.5');
  });

  it('is null for our server acting for no shopper, or a malformed IP', () => {
    expect(clientIp(req({ 'x-internal-key': KEY }))).toBeNull();
    expect(clientIp(req({ 'x-internal-key': KEY, 'x-client-ip': 'not-an-ip' }))).toBeNull();
  });

  it('trusts nothing while no key is configured', () => {
    delete process.env.INTERNAL_API_KEY;
    expect(clientIp(req({ 'x-internal-key': '', 'x-client-ip': '203.0.113.7' }))).toBe('172.18.0.5');
  });
});

describe('HumanGuard', () => {
  const config = (secret?: string) => ({ get: () => secret }) as unknown as ConfigService<Env, true>;
  const ctx = (headers: Record<string, string>) =>
    ({ switchToHttp: () => ({ getRequest: () => req(headers) }) }) as unknown as ExecutionContext;
  const answer = (body: unknown) => vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(body));
  afterEach(() => vi.restoreAllMocks());

  it('is off without a secret', async () => {
    await expect(new HumanGuard(config()).canActivate(ctx({}))).resolves.toBe(true);
  });

  it('needs a token', async () => {
    await expect(new HumanGuard(config('s')).canActivate(ctx({}))).rejects.toMatchObject({ response: { code: 'CAPTCHA_REQUIRED' } });
  });

  it('accepts tokens Cloudflare confirms and refuses the rest', async () => {
    const fetch = answer({ success: true });
    await expect(new HumanGuard(config('s')).canActivate(ctx({ 'x-turnstile-token': 't' }))).resolves.toBe(true);
    const sent = fetch.mock.calls[0][1]?.body as URLSearchParams;
    expect(Object.fromEntries(sent)).toEqual({ secret: 's', response: 't', remoteip: '172.18.0.5' });

    answer({ success: false, 'error-codes': ['invalid-input-response'] });
    const refused = new HumanGuard(config('s')).canActivate(ctx({ 'x-turnstile-token': 't' }));
    await expect(refused).rejects.toBeInstanceOf(BadRequestException);
    await expect(refused).rejects.toMatchObject({ response: { code: 'CAPTCHA_FAILED' } });
  });

  it('lets requests through when Cloudflare is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));
    await expect(new HumanGuard(config('s')).canActivate(ctx({ 'x-turnstile-token': 't' }))).resolves.toBe(true);
  });
});

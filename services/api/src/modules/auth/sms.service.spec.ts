import { HttpException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.validation.js';
import { SmsService, telbizPhone } from './sms.service.js';

const config = (env: Partial<Env>) => ({ get: (key: keyof Env) => env[key] }) as unknown as ConfigService<Env, true>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('SmsService (Telbiz)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('converts numbers to the local format', () => {
    expect(telbizPhone('+8562055551234')).toBe('2055551234');
  });

  it('only logs when no credentials are set', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await new SmsService(config({ NODE_ENV: 'development' as Env['NODE_ENV'] })).send('+8562055551234', 'hi');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('gets a token once, then sends with it', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ accessToken: 'tok', expiresIn: 3600 }))
      .mockResolvedValueOnce(json({ response: { success: true }, key: { rangeKey: 'm1' } }))
      .mockResolvedValueOnce(json({ response: { success: true }, key: { rangeKey: 'm2' } }));
    const sms = new SmsService(config({ TELBIZ_CLIENT_ID: 'id', TELBIZ_SECRETKEY: 'secret' }));

    await sms.send('+8562055551234', 'code 123456');
    await sms.send('+8562055551234', 'code 654321');

    expect(fetch).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetch.mock.calls[0]!;
    expect(tokenUrl).toBe('https://api.telbiz.la/api/v1/connect/token');
    expect(JSON.parse(tokenInit!.body as string)).toEqual({ ClientID: 'id', Secret: 'secret', GrantType: 'client_credentials' });
    const [sendUrl, sendInit] = fetch.mock.calls[1]!;
    expect(sendUrl).toBe('https://api.telbiz.la/api/v1/smsservice/newtransaction');
    expect((sendInit!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(sendInit!.body as string)).toEqual({ Phone: '2055551234', Title: 'OTP', Message: 'code 123456' });
  });

  it('renews the token once on 401', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ accessToken: 'old' }))
      .mockResolvedValueOnce(json({ message: 'expired' }, 401))
      .mockResolvedValueOnce(json({ accessToken: 'new' }))
      .mockResolvedValueOnce(json({ response: { success: true } }));
    await new SmsService(config({ TELBIZ_CLIENT_ID: 'id', TELBIZ_SECRETKEY: 's' })).send('+8562055551234', 'x');
    expect((fetch.mock.calls[3]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer new');
  });

  it('reports SMS_FAILED when Telbiz refuses', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ accessToken: 'tok' }))
      .mockResolvedValueOnce(json({ success: false, code: 'CREDIT_NOT_SUFFICIENT', message: 'No credit' }, 400));
    const sms = new SmsService(config({ TELBIZ_CLIENT_ID: 'id', TELBIZ_SECRETKEY: 's' }));
    vi.spyOn(sms['logger'], 'error').mockImplementation(() => {});
    const err = await sms.send('+8562055551234', 'x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(503);
    expect((err as HttpException).getResponse()).toMatchObject({ code: 'SMS_FAILED' });
  });
});

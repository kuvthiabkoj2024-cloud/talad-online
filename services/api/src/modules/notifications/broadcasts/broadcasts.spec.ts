import { describe, expect, it, vi } from 'vitest';
import { BroadcastsService } from './broadcasts.service.js';
import { ExpoPushService } from '../expo-push.service.js';

const admin = { id: 'a1' } as never;
const content = { lo: { title: 'ສະບາຍດີ', body: 'ໂປຣ' }, en: { title: 'Hello', body: 'Promo' } };

function setup(customers: { id: string; promoNotifications: boolean; phone: string | null; locale?: string; shop?: { id: string; phone: string } | null }[] = []) {
  const prisma = {
    customer: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValueOnce(customers.map((c) => ({ locale: 'lo', shop: null, ...c }))).mockResolvedValue([]),
    },
    shop: { count: vi.fn().mockResolvedValue(1) },
    broadcast: {
      create: vi.fn().mockResolvedValue({ id: 'b1' }),
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    notification: { createMany: vi.fn().mockImplementation(({ data }: { data: unknown[] }) => ({ count: data.length })) },
  };
  const sms = { send: vi.fn().mockResolvedValue(undefined) };
  const phones = { sendToAccounts: vi.fn().mockImplementation((ids: string[]) => ({ sent: ids.length, failed: 0 })) };
  const web = { sendToMany: vi.fn().mockResolvedValue({ sent: 0, failed: 0 }) };
  const service = new BroadcastsService(prisma as never, { log: vi.fn() } as never, sms as never, phones as never, web as never);
  return { service, prisma, sms, phones, web };
}

const broadcast = (over: Record<string, unknown>) =>
  ({ id: 'b1', audience: 'customers', targetCustomerId: null, targetShopId: null, type: 'PROMOTION', channels: ['IN_APP', 'PUSH'], content, link: null, repeat: 'ONCE', weekdays: [], startAt: new Date(), endAt: null, status: 'ACTIVE', nextRunAt: new Date(), runs: 0, ...over }) as never;

describe('broadcasts', () => {
  it('refuses SMS to everyone (one person only)', async () => {
    const { service } = setup();
    await expect(
      service.create(admin, { audience: 'customers', type: 'SYSTEM', channels: ['SMS'], content, repeat: 'ONCE' } as never),
    ).rejects.toMatchObject({ response: { code: 'SMS_SINGLE_ONLY' } });
  });

  it('needs the person for a single send, and weekdays for WEEKLY', async () => {
    const { service } = setup();
    await expect(service.create(admin, { audience: 'customer', type: 'SYSTEM', channels: ['IN_APP'], content, repeat: 'ONCE' } as never)).rejects.toMatchObject({
      response: { code: 'TARGET_REQUIRED' },
    });
    await expect(
      service.create(admin, { audience: 'customers', type: 'SYSTEM', channels: ['IN_APP'], content, repeat: 'WEEKLY', weekdays: [] } as never),
    ).rejects.toMatchObject({ response: { code: 'WEEKDAYS_REQUIRED' } });
  });

  it('puts a promotion in every inbox but pushes only to customers who allow promotions', async () => {
    const { service, phones, prisma } = setup([
      { id: 'c1', promoNotifications: true, phone: null },
      { id: 'c2', promoNotifications: false, phone: null },
    ]);
    const result = await service.run(broadcast({}), 1);
    expect(prisma.notification.createMany.mock.calls[0]![0].data).toHaveLength(2);
    expect(phones.sendToAccounts).toHaveBeenCalledWith(['c1'], expect.objectContaining({ kind: 'notification', i18n: content }), 'customer');
    expect(result).toMatchObject({ recipients: 2, inApp: 2, pushSent: 1 });
  });

  it("sends a shop's SMS to the shop's number, in the owner's language", async () => {
    const { service, sms } = setup([{ id: 'owner', promoNotifications: true, phone: '+8562011111111', locale: 'en', shop: { id: 's1', phone: '+8562022222222' } }]);
    const result = await service.run(broadcast({ audience: 'shop', targetShopId: 's1', type: 'SYSTEM', channels: ['SMS'] }), 1);
    expect(sms.send).toHaveBeenCalledWith('+8562022222222', 'Hello\nPromo');
    expect(result.smsSent).toBe(1);
  });

  it('fills {name}, {phone} and {shop} for each recipient, on every channel', async () => {
    const { service, prisma, sms, phones } = setup([
      { id: 'owner', name: 'Lar', promoNotifications: true, phone: '+8562011111111', shop: { id: 's1', name: 'Kartoon Shirts', phone: '+8562022222222' } } as never,
    ]);
    const personal = { lo: { title: 'ສະບາຍດີ {name}', body: 'ຮ້ານ {shop} · {phone}' }, en: { title: 'Hi {name}', body: '{shop} · {phone}' } };
    await service.run(broadcast({ audience: 'shop', targetShopId: 's1', type: 'SYSTEM', channels: ['IN_APP', 'PUSH', 'SMS'], content: personal }), 1);
    const row = prisma.notification.createMany.mock.calls[0]![0].data[0];
    expect(row).toMatchObject({ shopId: 's1', title: 'Hi Lar', body: 'Kartoon Shirts · +856 20 2222 2222' });
    expect(row.data.i18n.lo).toEqual({ title: 'ສະບາຍດີ Lar', body: 'ຮ້ານ Kartoon Shirts · +856 20 2222 2222' });
    const eventFor = phones.sendToAccounts.mock.calls[0]![1] as (id: string) => { title: string };
    expect(eventFor('owner').title).toBe('Hi Lar');
    expect(sms.send).toHaveBeenCalledWith('+8562022222222', 'ສະບາຍດີ Lar\nຮ້ານ Kartoon Shirts · +856 20 2222 2222');
  });

  it('leaves out a missing value tidily', async () => {
    const { fillBroadcastText } = await import('@talad/shared');
    expect(fillBroadcastText('Hi {name}, your shop {shop} is ready.', { name: 'Noy', shop: null })).toBe('Hi Noy, your shop is ready.');
  });

  it('sends a due broadcast only when it wins the claim (no double sends)', async () => {
    const { service, prisma } = setup();
    const due = broadcast({});
    prisma.broadcast.findMany.mockResolvedValue([due]);
    prisma.broadcast.updateMany.mockResolvedValue({ count: 0 }); // another instance claimed it
    const run = vi.spyOn(service, 'run');
    await service.tick();
    expect(run).not.toHaveBeenCalled();
  });
});

describe('ExpoPushService', () => {
  it("forgets phones Expo reports as gone, and writes in each account's language", async () => {
    const prisma = {
      pushDevice: { findMany: vi.fn().mockResolvedValue([{ token: 'ExponentPushToken[a]', customerId: 'c1', customer: { locale: 'lo' } }, { token: 'ExponentPushToken[b]', customerId: 'c2', customer: { locale: 'en' } }]), deleteMany: vi.fn() },
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ status: 'ok' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }] }), { status: 200 }),
    );
    const service = new ExpoPushService(prisma as never, { onCommitted: vi.fn() } as never, { get: () => undefined } as never);
    const count = await service.sendToAccounts(['c1'], { kind: 'notification', id: 'n1', type: 'SYSTEM', title: 'Hi', body: 'B', i18n: content }, 'customer');
    expect(count).toEqual({ sent: 1, failed: 1 });
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['ExponentPushToken[b]'] } } });
    const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(sent[0]).toMatchObject({ title: 'ສະບາຍດີ', channelId: 'default', data: { app: 'customer' } });
    expect(sent[1]).toMatchObject({ title: 'Hello' });
    fetchMock.mockRestore();
  });
});

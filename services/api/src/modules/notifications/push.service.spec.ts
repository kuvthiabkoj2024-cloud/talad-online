import { describe, expect, it } from 'vitest';
import { payloadFor } from './push.service.js';

const SELLER = 'https://shop.example';
const note = (link?: string) => ({ kind: 'notification' as const, id: 'n1', type: 'SYSTEM', title: 'T', body: 'B', ...(link && { link }) });

describe('payloadFor', () => {
  it('opens a chat in the right app', () => {
    const message = { kind: 'message' as const, conversationId: 'c1', from: 'Shop', preview: 'Hi' };
    expect(payloadFor(message, 'customer', 'lo', SELLER).url).toBe('/lo/messages/c1');
    expect(payloadFor(message, 'shop', 'en', SELLER).url).toBe('/messages/c1');
  });

  it('puts the language in front of storefront links', () => {
    expect(payloadFor(note('/feed?post=p1&comment=c1'), 'customer', 'en', SELLER).url).toBe('/en/feed?post=p1&comment=c1');
    expect(payloadFor(note('/'), 'customer', 'lo', SELLER).url).toBe('/lo');
    expect(payloadFor(note(), 'customer', 'lo', SELLER).url).toBe('/lo/notifications');
  });

  it('sends seller news to the Seller Center', () => {
    expect(payloadFor(note('seller:/finance'), 'customer', 'lo', SELLER).url).toBe('https://shop.example/finance');
    expect(payloadFor(note('/orders/TL1'), 'shop', 'lo', SELLER).url).toBe('/orders/TL1');
    expect(payloadFor(note(), 'shop', 'lo', SELLER).url).toBe('/');
  });
});

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { detectImage } from '../media/image-type.js';
import { MediaService } from '../media/media.service.js';
import { filePrefix, storageFolder } from '../media/storage-keys.js';
import { StorageService } from '../media/storage.service.js';
import type { VirtualItem } from '../cart/cart.service.js';
import { ChatOrdersService } from '../orders/chat-orders.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { ShopBotService } from './bot/shop-bot.service.js';

/** Who is looking: the customer side or the shop side of a conversation. */
export type Side = { kind: 'customer'; customerId: string } | { kind: 'shop'; shopId: string };

export const MESSAGE_LIMITS = { textMax: 2000, photoMaxBytes: 5 * 1024 * 1024, page: 50 } as const;

const productCard = {
  select: { id: true, name: true, slug: true, price: true, images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { key: true } }, shop: { select: { slug: true } } },
} satisfies Prisma.ProductDefaultArgs;

/**
 * Private customer ↔ shop chat (§3 "chat to shop"). One conversation per customer and shop;
 * only those two sides can read it — every lookup is scoped to the viewer's side, so another
 * account (or shop) gets "not found". Photos live in private storage and are streamed through
 * the API to the two sides only. The shop's bot answers each customer message (bot/).
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly media: MediaService,
    private readonly bot: ShopBotService,
    private readonly chatOrders: ChatOrdersService,
    private readonly realtime: RealtimeService,
  ) {}

  /** The other side of the chat hears about a new message right away (its chat refreshes, a sound plays). */
  async announce(conv: { id: string; shopId: string; customerId: string; shop: { name: string }; customer: { name: string } }, sender: 'CUSTOMER' | 'SHOP' | 'BOT', preview: string) {
    const toShop = sender === 'CUSTOMER';
    await this.realtime.emit(this.prisma, toShop ? `shop:${conv.shopId}` : `customer:${conv.customerId}`, {
      kind: 'message',
      conversationId: conv.id,
      from: toShop ? conv.customer.name : conv.shop.name,
      preview: preview.length > 80 ? `${preview.slice(0, 79)}…` : preview,
    });
  }

  /** Customer opens a chat with a shop (from a product, the shop page or an order). */
  async start(customerId: string, shopSlug: string) {
    const shop = await this.prisma.shop.findUnique({ where: { slug: shopSlug }, select: { id: true, status: true, ownerId: true } });
    if (!shop || shop.status !== 'APPROVED') throw new NotFoundException({ code: 'SHOP_NOT_FOUND', message: 'Shop not found' });
    if (shop.ownerId === customerId) throw new ForbiddenException({ code: 'OWN_SHOP', message: 'You can’t chat with your own shop' });
    const conv = await this.prisma.shopConversation.upsert({
      where: { shopId_customerId: { shopId: shop.id, customerId } },
      create: { shopId: shop.id, customerId },
      update: {},
      select: { id: true },
    });
    return conv;
  }

  async list(side: Side, q?: string) {
    const rows = await this.prisma.shopConversation.findMany({
      where: {
        ...(side.kind === 'customer' ? { customerId: side.customerId } : { shopId: side.shopId }),
        // Only conversations with at least one message (opening a chat doesn't create noise).
        messages: { some: {} },
        ...(q && side.kind === 'shop' && { customer: { name: { contains: q, mode: 'insensitive' } } }),
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      include: {
        shop: { select: { name: true, slug: true, logoUrl: true } },
        customer: { select: { name: true } },
        messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { sender: true, text: true, imageKey: true, productId: true, chatOrderId: true, latitude: true, createdAt: true } },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      shop: { name: c.shop.name, slug: c.shop.slug, logoUrl: c.shop.logoUrl ? this.media.publicUrl(c.shop.logoUrl) : null },
      customer: { name: c.customer.name },
      lastMessage: c.messages[0] ? { ...preview(c.messages[0]), mine: mine(side, c.messages[0].sender), bot: c.messages[0].sender === 'BOT', system: c.messages[0].sender === 'SYSTEM' } : null,
      lastMessageAt: c.lastMessageAt,
      unread: side.kind === 'customer' ? c.customerUnread : c.shopUnread,
    }));
  }

  async unreadCount(side: Side): Promise<{ count: number }> {
    const agg = await this.prisma.shopConversation.aggregate({
      where: side.kind === 'customer' ? { customerId: side.customerId } : { shopId: side.shopId },
      _sum: side.kind === 'customer' ? { customerUnread: true } : { shopUnread: true },
    });
    return { count: (side.kind === 'customer' ? agg._sum.customerUnread : agg._sum.shopUnread) ?? 0 };
  }

  /** Conversation header + messages. `after`: only newer ones (polling); `before`: older page. */
  async thread(side: Side, id: string, opts: { after?: string; before?: string } = {}) {
    const conv = await this.own(side, id);
    const cursor = opts.after ?? opts.before;
    const pivot = cursor ? await this.prisma.shopMessage.findFirst({ where: { id: cursor, conversationId: id }, select: { createdAt: true } }) : null;
    const rows = await this.prisma.shopMessage.findMany({
      where: {
        conversationId: id,
        ...(pivot && opts.after && { createdAt: { gt: pivot.createdAt } }),
        ...(pivot && opts.before && { createdAt: { lt: pivot.createdAt } }),
      },
      orderBy: { createdAt: opts.after ? 'asc' : 'desc' },
      take: MESSAGE_LIMITS.page,
    });
    const messages = opts.after ? rows : rows.reverse();
    const productIds = [...new Set(messages.flatMap((m) => [...(m.productId ? [m.productId] : []), ...m.productIds]))];
    const products = new Map((await this.prisma.product.findMany({ where: { id: { in: productIds } }, ...productCard })).map((p) => [p.id, this.ref(p)]));
    const orders = await this.chatOrders.summaries(messages.flatMap((m) => (m.chatOrderId ? [m.chatOrderId] : [])));
    return {
      id: conv.id,
      shop: { name: conv.shop.name, slug: conv.shop.slug, logoUrl: conv.shop.logoUrl ? this.media.publicUrl(conv.shop.logoUrl) : null },
      customer: { name: conv.customer.name },
      hasMore: !opts.after && rows.length === MESSAGE_LIMITS.page,
      /** When the other side last opened the chat: the viewer's messages up to then are read. */
      otherReadAt: side.kind === 'customer' ? conv.shopReadAt : conv.customerReadAt,
      messages: messages.map((m) => ({
        id: m.id,
        mine: mine(side, m.sender),
        /** The shop's auto-reply. */
        bot: m.sender === 'BOT',
        /** A Taladonline notice to both sides (e.g. an order out of stock), shown centred. */
        system: m.sender === 'SYSTEM',
        text: m.text,
        hasPhoto: !!m.imageKey,
        product: m.productId ? (products.get(m.productId) ?? null) : null,
        products: m.productIds.flatMap((pid) => (products.has(pid) ? [products.get(pid)!] : [])),
        /** An order card (buy by chat): the customer completes and places it. */
        order: m.chatOrderId ? (orders.get(m.chatOrderId) ?? null) : null,
        /** A shared location (e.g. where to deliver). */
        location: m.latitude !== null && m.longitude !== null ? { lat: m.latitude, lng: m.longitude } : null,
        createdAt: m.createdAt,
      })),
    };
  }

  /** A message from one side: text, a photo, a product and/or a location. The other side's unread count goes up. */
  async send(side: Side, id: string, input: { text?: string; productId?: string; photo?: Express.Multer.File; location?: { lat: number; lng: number } }) {
    const conv = await this.own(side, id);
    const text = (input.text ?? '').trim();
    if (text.length > MESSAGE_LIMITS.textMax) throw new BadRequestException({ code: 'MESSAGE_TOO_LONG', message: 'Message is too long' });
    if (!text && !input.photo && !input.productId && !input.location) throw new BadRequestException({ code: 'EMPTY_MESSAGE', message: 'Type a message or attach a photo' });
    if (input.productId) {
      const ok = await this.prisma.product.count({ where: { id: input.productId, shopId: conv.shopId } });
      if (!ok) throw new BadRequestException({ code: 'INVALID_PRODUCT', message: 'That product isn’t from this shop' });
    }
    let imageKey: string | null = null;
    if (input.photo) {
      if (input.photo.size > MESSAGE_LIMITS.photoMaxBytes) throw new BadRequestException({ code: 'FILE_TOO_LARGE', message: 'Photo is too large' });
      const type = detectImage(input.photo.buffer);
      if (!type) throw new BadRequestException({ code: 'INVALID_IMAGE', message: 'Send a JPG, PNG or WebP photo' });
      imageKey = `${filePrefix(storageFolder.conversation(id), 'photo')}${randomUUID()}.${type.ext}`;
      await this.storage.put(imageKey, input.photo.buffer, type.type);
    }
    const sender = side.kind === 'customer' ? 'CUSTOMER' : 'SHOP';
    const [message] = await this.prisma.$transaction([
      this.prisma.shopMessage.create({
        data: {
          conversationId: id,
          sender,
          text,
          imageKey,
          productId: input.productId ?? null,
          // About 1 m precision is plenty to find a door.
          latitude: input.location ? Math.round(input.location.lat * 1e5) / 1e5 : null,
          longitude: input.location ? Math.round(input.location.lng * 1e5) / 1e5 : null,
        },
      }),
      this.prisma.shopConversation.update({
        where: { id },
        data: { lastMessageAt: new Date(), ...(sender === 'CUSTOMER' ? { shopUnread: { increment: 1 } } : { customerUnread: { increment: 1 } }) },
      }),
    ]);
    await this.announce(conv, sender, text || (imageKey ? '📷' : input.location ? '📍' : '🛍'));
    // The shop's bot answers the customer (in the background; it's announced when sent).
    // A shared location is for the shop to read, not a question for the bot.
    if (sender === 'CUSTOMER' && !(input.location && !text && !input.photo)) void this.bot.respond(id, input.photo);
    return (await this.thread(side, id, { after: undefined })).messages.find((m) => m.id === message.id) ?? { id: message.id };
  }

  /** A product of this conversation's shop, for the "ask about this product" chip. */
  async product(side: Side, id: string, productId: string) {
    const conv = await this.own(side, id);
    const p = await this.prisma.product.findFirst({ where: { id: productId, shopId: conv.shopId }, ...productCard });
    if (!p) throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Product not found' });
    return this.ref(p);
  }

  private ref(p: Prisma.ProductGetPayload<typeof productCard>) {
    return { id: p.id, name: p.name, slug: p.slug, shopSlug: p.shop.slug, price: p.price.toNumber(), imageUrl: p.images[0] ? this.media.publicUrl(p.images[0].key) : null };
  }

  /**
   * An order card in the chat: the customer starts one from a product, or the shop sends one
   * (Facebook-style selling). Either way only the customer can complete and place it.
   */
  async sendOrder(side: Side, id: string, items: VirtualItem[]) {
    const conv = await this.own(side, id);
    const sender = side.kind === 'customer' ? 'CUSTOMER' : 'SHOP';
    const order = await this.chatOrders.create({ customerId: conv.customerId, shopId: conv.shopId, items, source: 'SHOP_CHAT', createdBy: sender, conversationId: id });
    await this.postOrder(id, order.id, sender);
    await this.announce(conv, sender, '🛍');
    return { orderId: order.id };
  }

  /** The card's message in the chat (also used by the shop's bot). */
  async postOrder(conversationId: string, orderId: string, sender: 'CUSTOMER' | 'SHOP' | 'BOT', text = '') {
    await this.prisma.$transaction([
      this.prisma.shopMessage.create({ data: { conversationId, sender, text, chatOrderId: orderId } }),
      this.prisma.shopConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date(), ...(sender === 'CUSTOMER' ? { shopUnread: { increment: 1 } } : { customerUnread: { increment: 1 } }) },
      }),
    ]);
  }

  /** The shop cancels a card it (or its bot) sent that wasn't placed. */
  async cancelOrder(shopId: string, id: string, orderId: string) {
    await this.own({ kind: 'shop', shopId }, id);
    await this.chatOrders.cancel({ shopId }, orderId);
  }

  async markRead(side: Side, id: string) {
    await this.own(side, id);
    const now = new Date();
    await this.prisma.shopConversation.update({
      where: { id },
      data: side.kind === 'customer' ? { customerUnread: 0, customerReadAt: now } : { shopUnread: 0, shopReadAt: now },
    });
  }

  /** A message photo, for the conversation's two sides only. */
  async photo(side: Side, id: string, messageId: string) {
    await this.own(side, id);
    const m = await this.prisma.shopMessage.findFirst({ where: { id: messageId, conversationId: id }, select: { imageKey: true } });
    if (!m?.imageKey) throw new NotFoundException('No photo');
    return this.storage.get(m.imageKey);
  }

  /** The conversation, if the viewer is one of its two sides; "not found" otherwise. */
  private async own(side: Side, id: string) {
    const conv = await this.prisma.shopConversation.findFirst({
      where: { id, ...(side.kind === 'customer' ? { customerId: side.customerId } : { shopId: side.shopId }) },
      include: { shop: { select: { name: true, slug: true, logoUrl: true } }, customer: { select: { name: true } } },
    });
    if (!conv) throw new NotFoundException({ code: 'CONVERSATION_NOT_FOUND', message: 'Conversation not found' });
    return conv;
  }
}

/** Whether `sender` is the viewer's side (the shop's bot counts as the shop; Taladonline is neither). */
const mine = (side: Side, sender: string) =>
  sender !== 'SYSTEM' && (side.kind === 'customer' ? sender === 'CUSTOMER' : sender !== 'CUSTOMER');

/** One-line summary for conversation lists. */
function preview(m: { text: string; imageKey: string | null; productId: string | null; chatOrderId: string | null; latitude?: number | null; createdAt: Date }) {
  return {
    text: m.text.slice(0, 120),
    location: m.latitude != null && !m.text && !m.imageKey,
    photo: !!m.imageKey && !m.text,
    product: !!m.productId && !m.text && !m.imageKey,
    order: !!m.chatOrderId && !m.text,
    createdAt: m.createdAt,
  };
}

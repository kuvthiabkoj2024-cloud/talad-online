import { Injectable, Logger } from '@nestjs/common';
import { formatMoney, provinceName, type BusinessHours } from '@talad/shared';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AnthropicService, replyText, type ContentBlock, type Message, type Tool } from '../../ai/anthropic.service.js';
import type { VirtualItem } from '../../cart/cart.service.js';
import { detectIntent, normalizeSize, stripIntentWords } from '../../catalog/chat/chat-intents.js';
import { extractQuery, hasColor, labelOf, replyLanguage, takeColor, toConcepts, type ChatLocale } from '../../catalog/chat/chat-text.js';
import { PhotoSearchService } from '../../catalog/image-search/photo-search.service.js';
import { ProductsService, type ProductCard } from '../../catalog/products/products.service.js';
import { CmsService } from '../../cms/cms.service.js';
import { ChatOrdersService } from '../../orders/chat-orders.service.js';
import { RealtimeService } from '../../realtime/realtime.service.js';
import { analyse, describeHours, INFO_TOPICS, saidQuantity, stripBuyWords, type BotTopic } from './shop-bot-text.js';

/** Product cards under one bot reply. */
const MAX_PRODUCTS = 8;
const MAX_TOOL_ROUNDS = 3;
/** The seller wrote within this long: they're chatting, so the bot doesn't add "the shop will reply". */
const SELLER_ACTIVE_MS = 10 * 60_000;

export interface BotTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface BotAnswer {
  text: string;
  productIds: string[];
  /** What the bot understood the message to be about. */
  topic: BotTopic['kind'] | 'photo' | 'ai';
  /** Nothing the bot can answer: the seller has to (the reply just says so). */
  handoff: boolean;
  engine: 'ai' | 'basic';
  /** The customer wants to buy: an order card for this goes with the reply. */
  order?: VirtualItem & { quantitySaid: boolean };
}

/** What the bot knows about one shop. */
interface ShopFacts {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  address: string | null;
  hours: BusinessHours | null;
  transfer: boolean;
  faqs: { question: string; answer: string }[];
}

/**
 * The shop's chat bot (§3 "chat to shop"): always on, it answers each customer message in
 * the shop's private chat. It first works out what is asked — information (hours, address,
 * payment, delivery, promotions, the seller's FAQ) is answered in text only; product
 * questions get the answer plus that shop's matching products. Anything else (an order, a
 * return…) is left to the seller. Claude writes the reply when configured; otherwise, or if
 * it fails, the built-in rules do.
 */
@Injectable()
export class ShopBotService {
  private readonly logger = new Logger(ShopBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly photos: PhotoSearchService,
    private readonly claude: AnthropicService,
    private readonly cms: CmsService,
    private readonly chatOrders: ChatOrdersService,
    private readonly realtime: RealtimeService,
  ) {}

  /** After a customer's message: the bot's reply in the chat (or nothing, when the seller is already on it). */
  async respond(conversationId: string, photo?: Express.Multer.File): Promise<void> {
    try {
      const conv = await this.prisma.shopConversation.findUnique({ where: { id: conversationId }, select: { shopId: true, customerId: true } });
      if (!conv) return;
      const recent = await this.prisma.shopMessage.findMany({ where: { conversationId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 14 });
      const [last, ...earlier] = recent;
      if (last?.sender !== 'CUSTOMER') return;
      const history: BotTurn[] = earlier.reverse().map((m) => ({ role: m.sender === 'CUSTOMER' ? 'user' : 'assistant', text: m.text }));
      // The product the chat is about: attached to this message, or the latest one shared.
      const focusId = recent.find((m) => m.productId)?.productId ?? null;
      // "I'll take it" after the bot showed one product means that one.
      const lastShown = recent.find((m) => m.sender === 'BOT' && m.productIds.length)?.productIds ?? [];
      // An order card still open in this chat: "ສັ່ງຊື້" means that one.
      const draft = await this.chatOrders.openDraftFor(conversationId);
      const draftProductId = draft ? (draft.items as unknown as VirtualItem[])[0].productId : null;
      const answer = await this.answer(conv.shopId, { text: last.text, photo, history, focusId, lastShown, draftProductId });

      if (answer.handoff) {
        // Don't repeat "the shop will reply" while the seller is chatting or after saying it once.
        const seller = recent.find((m) => m.sender === 'SHOP');
        const sellerActive = seller && Date.now() - seller.createdAt.getTime() < SELLER_ACTIVE_MS;
        const lastBot = recent.find((m) => m.sender !== 'CUSTOMER');
        if (sellerActive || (lastBot?.sender === 'BOT' && HANDOFF_TEXTS.has(lastBot.text))) return;
      }
      let chatOrderId: string | null = null;
      if (answer.order) {
        try {
          const { quantitySaid, ...item } = answer.order;
          // Asked again ("ສັ່ງຊື້" twice): bring back the same card, with any new size/quantity.
          const draft = await this.chatOrders.openDraftFor(conversationId, item.productId);
          if (draft) {
            await this.chatOrders.adjust(draft, { variantId: item.variantId, quantity: quantitySaid ? item.quantity : null });
            chatOrderId = draft.id;
          } else {
            chatOrderId = (await this.chatOrders.create({ customerId: conv.customerId, shopId: conv.shopId, items: [item], source: 'SHOP_CHAT', createdBy: 'BOT', conversationId })).id;
          }
        } catch {
          // Not orderable right now (sold out, the customer's own shop…): the seller takes it.
          answer.text = B[replyLanguage(last.text, history, 'lo')].handoff((await this.facts(conv.shopId)).name);
        }
      }
      await this.prisma.$transaction([
        this.prisma.shopMessage.create({ data: { conversationId, sender: 'BOT', text: answer.text, productIds: answer.productIds, chatOrderId } }),
        this.prisma.shopConversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date(), customerUnread: { increment: 1 } } }),
      ]);
      const shop = await this.prisma.shop.findUnique({ where: { id: conv.shopId }, select: { name: true } });
      await this.realtime.emit(this.prisma, `customer:${conv.customerId}`, {
        kind: 'message',
        conversationId,
        from: shop?.name ?? '',
        preview: answer.text.length > 80 ? `${answer.text.slice(0, 79)}…` : answer.text,
      });
    } catch (e) {
      this.logger.warn(`Shop bot couldn't reply in ${conversationId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** The bot's answer to a message (also Seller Center's "try it" box, where nothing is saved). */
  async answer(
    shopId: string,
    input: { text: string; photo?: Express.Multer.File; history: BotTurn[]; focusId: string | null; lastShown?: string[]; draftProductId?: string | null },
  ): Promise<BotAnswer> {
    const text = input.text.trim().slice(0, 1000);
    const lang = replyLanguage(text, input.history, 'lo');
    const shop = await this.facts(shopId);
    if (input.photo) return this.photoAnswer(shop, input.photo, lang);
    // Ordering is never left to the AI: the card is built from the catalog by these rules.
    const topic = analyse(text, shop.faqs.map((f) => f.question));
    if (topic.kind === 'buy') return this.buyAnswer(shop, text, topic.quantity, input.draftProductId ?? input.focusId, input.lastShown ?? [], lang);
    if (this.claude.enabled) {
      try {
        return await this.aiAnswer(shop, text, input.history, input.focusId, lang);
      } catch (e) {
        this.logger.warn(`Shop bot AI reply failed, using the built-in rules: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.basicAnswer(shop, text, input.history, input.focusId, lang);
  }

  private async facts(shopId: string): Promise<ShopFacts> {
    const shop = await this.prisma.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: {
        id: true, slug: true, name: true, description: true, address: true, businessHours: true, paymentAccountNumber: true, paymentQrKey: true,
        faqs: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { question: true, answer: true } },
      },
    });
    return {
      id: shop.id,
      slug: shop.slug,
      name: shop.name,
      description: shop.description,
      address: shop.address,
      hours: shop.businessHours as BusinessHours | null,
      transfer: !!(shop.paymentAccountNumber || shop.paymentQrKey),
      faqs: shop.faqs,
    };
  }

  // ─── Built-in rules ────────────────────────────────────────────────────────

  private async basicAnswer(shop: ShopFacts, text: string, history: BotTurn[], focusId: string | null, lang: ChatLocale): Promise<BotAnswer> {
    const t = B[lang];
    const topic = analyse(text, shop.faqs.map((f) => f.question));
    const say = (reply: string, productIds: string[] = [], handoff = false): BotAnswer => ({
      text: reply,
      // Information questions never come with product cards.
      productIds: INFO_TOPICS.has(topic.kind) ? [] : productIds.slice(0, MAX_PRODUCTS),
      topic: topic.kind,
      handoff,
      engine: 'basic',
    });

    switch (topic.kind) {
      case 'faq':
        return say(shop.faqs[topic.index].answer);
      case 'greeting':
        return say(t.greeting(shop.name));
      case 'thanks':
        return say(t.thanks);
      case 'order':
        return say(t.order(shop.name), [], true);
      case 'hours': {
        const hours = describeHours(shop.hours, lang);
        return hours ? say(t.hours(hours)) : say(t.handoff(shop.name), [], true);
      }
      case 'location':
        return shop.address ? say(t.location(shop.address)) : say(t.handoff(shop.name), [], true);
      case 'payment': {
        const methods = await this.paymentMethods(shop, lang);
        const askedCod = /\bcod\b|cash on delivery|ປາຍທາງ/i.test(text);
        return say(askedCod && !methods.cod ? t.codOff(methods.names) : t.payment(methods.names));
      }
      case 'delivery':
        return say(await this.delivery(topic.province, lang));
      case 'discount':
        return say(await this.promotions(shop, lang));
      case 'unknown':
        return say(t.handoff(shop.name), [], true);
      case 'search':
        return this.search(shop, topic, text, lang, say);
      case 'buy':
        return this.buyAnswer(shop, text, topic.quantity, focusId, [], lang);
      default:
        return this.productDetail(shop, topic, text, history, focusId, lang, say);
    }
  }

  /**
   * "I'll take 2, size L": an order card for the product named, the card already open (or the
   * product the chat is about), or the one just shown — with the size/colour picked when it's clear. Several candidates:
   * show them and ask which.
   */
  private async buyAnswer(shop: ShopFacts, text: string, quantity: number, focusId: string | null, lastShown: string[], lang: ChatLocale): Promise<BotAnswer> {
    const t = B[lang];
    const base = { topic: 'buy' as const, handoff: false, engine: 'basic' as const };
    const words = extractQuery(stripIntentWords(takeColor(stripBuyWords(text)).rest)).keywords;
    const named = words.length ? await this.find(shop.id, words) : [];
    const candidates = named.length ? named : focusId ? [focusId] : lastShown;
    if (candidates.length > 1) return { ...base, text: t.buyWhich, productIds: candidates.slice(0, MAX_PRODUCTS) };
    if (!candidates.length) return { ...base, text: words.length ? t.notFound(labelOf(toConcepts(words), lang) || words.join(' '), shop.name) : t.askWhich, productIds: [] };

    const product = await this.prisma.product.findFirst({
      where: { id: candidates[0], shopId: shop.id, status: 'PUBLISHED' },
      select: { id: true, name: true, variants: { select: { id: true, attributes: true, stock: true } } },
    });
    if (!product) return { ...base, text: t.askWhich, productIds: [] };
    // The option asked for ("ໄຊ L", "in blue"), when it picks exactly one variant.
    const intent = detectIntent(text);
    const size = intent?.kind === 'size' ? intent.size : null;
    const { color } = takeColor(text);
    const values = (v: (typeof product.variants)[number]) => Object.values((v.attributes ?? {}) as Record<string, unknown>).map(String);
    const fitting = product.variants.filter((v) => (!size || values(v).map(normalizeSize).includes(size)) && (!color || hasColor(color, values(v))));
    if ((size || color) && product.variants.length && !fitting.length) {
      const asked = size ?? (lang === 'lo' ? color!.lo : color!.en);
      return { ...base, text: size ? t.sizeNo(asked, product.name, [...new Set(product.variants.flatMap(values))]) : t.colorNo(asked, product.name, []), productIds: [] };
    }
    const variant = product.variants.length === 1 ? product.variants[0] : (size || color) && fitting.length === 1 ? fitting[0] : null;
    // Several sizes and none named: the card lets them tap one (and how many).
    const reply = product.variants.length > 1 && !variant ? t.orderCardChoose(product.name) : t.orderCard(product.name, quantity);
    return { ...base, text: reply, productIds: [], order: { productId: product.id, variantId: variant?.id ?? null, quantity, quantitySaid: saidQuantity(text) !== null } };
  }

  /** "Do you have coffee?": this shop's matching products, or a plain "sorry, we don't". */
  private async search(shop: ShopFacts, topic: Extract<BotTopic, { kind: 'search' }>, text: string, lang: ChatLocale, say: (r: string, ids?: string[], h?: boolean) => BotAnswer) {
    const concepts = toConcepts(topic.keywords);
    const words = labelOf(concepts, lang) || topic.keywords.join(' ');
    let ids = await this.find(shop.id, topic.keywords);
    if (topic.maxPrice) ids = (await this.products.cardsByIds(ids)).filter((c) => c.price <= topic.maxPrice!).map((c) => c.id);
    if (ids.length) return say(B[lang].found(words, ids.length), ids);
    // "Do you have …?" / a product word we know: a plain "sorry, we don't". Anything else
    // ("hello? anyone?") may not be about a product at all, so the seller answers it.
    const known = concepts.some((c) => c.known);
    if (known || asksForProduct(text)) return say(B[lang].notFound(words, shop.name), [], !known);
    return say(B[lang].handoff(shop.name), [], true);
  }

  /** Products of this shop for search words: all concepts, then only the known ones, then any word. */
  private async find(shopId: string, keywords: string[]): Promise<string[]> {
    const concepts = toConcepts(keywords);
    const known = concepts.filter((c) => c.known);
    let ids = await this.products.matchAll(concepts.map((c) => c.alternatives), MAX_PRODUCTS * 2, shopId);
    if (!ids.length && known.length) ids = await this.products.matchAll(known.map((c) => c.alternatives), MAX_PRODUCTS * 2, shopId);
    if (!ids.length) ids = (await this.products.keywordMatches(concepts.flatMap((c) => c.alternatives), null, MAX_PRODUCTS * 2, shopId)).map((r) => r.productId);
    return ids;
  }

  /**
   * Size, colour, price, stock and "cheaper?" questions, about the product named in the
   * message or — for "do you have this in blue?" — the one the chat is about. When the
   * customer is already looking at that product, the answer is text only.
   */
  private async productDetail(
    shop: ShopFacts,
    topic: Extract<BotTopic, { kind: 'color' | 'size' | 'price' | 'stock' | 'cheaper' }>,
    text: string,
    history: BotTurn[],
    focusId: string | null,
    lang: ChatLocale,
    say: (r: string, ids?: string[], h?: boolean) => BotAnswer,
  ): Promise<BotAnswer> {
    const t = B[lang];
    const subject = await this.subject(shop.id, text, history, focusId, lang);
    if (!subject) return say(t.askWhich);
    if (!subject.ids.length) return say(t.notFound(subject.words, shop.name));
    const rows = await this.options(subject.ids);
    const show = (ids: string[]) => (subject.fromFocus ? [] : ids);
    const name = subject.words;

    if (topic.kind === 'color') {
      const colorName = lang === 'lo' ? topic.color.lo : topic.color.en;
      const values = (p: (typeof rows)[number]) => p.variants.flatMap((v) => Object.values(v.attributes).map(String));
      const inColor = rows.filter((p) => hasColor(topic.color, [p.name, p.description ?? '', ...values(p)])).map((p) => p.id);
      if (inColor.length) return say(t.colorYes(colorName, name), show(subject.ids.filter((id) => inColor.includes(id))));
      const available = [...new Set(rows.flatMap((p) => p.variants.flatMap((v) => Object.entries(v.attributes).filter(([k]) => /colou?r|ສີ/i.test(k)).map(([, x]) => String(x)))))];
      return say(t.colorNo(colorName, name, available));
    }
    if (topic.kind === 'size') {
      const sizesOf = (p: (typeof rows)[number]) => p.variants.flatMap((v) => Object.values(v.attributes).map((x) => normalizeSize(String(x))));
      const fits = rows.filter((p) => sizesOf(p).includes(topic.size)).map((p) => p.id);
      if (fits.length) return say(t.sizeYes(topic.size, name), show(subject.ids.filter((id) => fits.includes(id))));
      return say(t.sizeNo(topic.size, name, [...new Set(rows.flatMap(sizesOf))]));
    }
    const cards = await this.products.cardsByIds(subject.ids);
    if (!cards.length) return say(t.notFound(name, shop.name));
    if (topic.kind === 'price') {
      const lines = cards.slice(0, 3).map((c) => `${c.name}: ${price(c, lang)}`);
      return say(subject.fromFocus ? lines[0] : `${t.priceIntro}\n${lines.join('\n')}`, show(subject.ids));
    }
    if (topic.kind === 'stock') {
      const units = (p: (typeof rows)[number]) => (p.variants.length ? p.variants.reduce((n, v) => n + v.stock, 0) : p.stock);
      const inStock = rows.filter((p) => units(p) > 0);
      if (!inStock.length) return say(t.soldOut(name));
      return say(t.inStock(name, inStock.reduce((n, p) => n + units(p), 0)), show(inStock.map((p) => p.id)));
    }
    // Cheaper: this shop's products in the same category, below the price asked about.
    const reference = cards[0];
    const sameKind = await this.prisma.product.findMany({
      where: { shopId: shop.id, status: 'PUBLISHED', categoryId: rows[0].categoryId, id: { notIn: subject.ids } },
      select: { id: true },
      take: 40,
    });
    const cheaper = (await this.products.cardsByIds(sameKind.map((p) => p.id))).filter((c) => c.price < reference.price).sort((a, b) => a.price - b.price);
    return cheaper.length ? say(t.cheaperYes(name), cheaper.map((c) => c.id)) : say(t.cheaperNo(name));
  }

  /** The product(s) a question is about: named in it, else the chat's product, else the last one asked about. */
  private async subject(shopId: string, text: string, history: BotTurn[], focusId: string | null, lang: ChatLocale) {
    const named = async (t: string) => {
      const q = extractQuery(stripIntentWords(takeColor(t).rest));
      if (!q.keywords.length) return null;
      const concepts = toConcepts(q.keywords);
      return { ids: await this.find(shopId, q.keywords), fromFocus: false, words: labelOf(concepts, lang) || q.keywords.join(' ') };
    };
    const now = await named(text);
    if (now?.ids.length) return now;
    if (focusId) {
      const p = await this.prisma.product.findFirst({ where: { id: focusId, shopId }, select: { id: true, name: true } });
      if (p) return { ids: [p.id], fromFocus: true, words: p.name };
    }
    if (now) return now;
    for (const turn of [...history].reverse().filter((h) => h.role === 'user')) {
      const before = await named(turn.text);
      if (before?.ids.length) return before;
    }
    return null;
  }

  private async options(ids: string[]) {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, description: true, stock: true, categoryId: true, variants: { select: { attributes: true, stock: true } } },
    });
    return rows.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, attributes: (v.attributes ?? {}) as Record<string, unknown> })) }));
  }

  /** A photo: this shop's products that look like it. */
  private async photoAnswer(shop: ShopFacts, photo: Express.Multer.File, lang: ChatLocale): Promise<BotAnswer> {
    const t = B[lang];
    const base = { topic: 'photo' as const, engine: 'basic' as const };
    try {
      const result = await this.photos.search(photo, { limit: 60 });
      const mine = (list: typeof result.items) => list.filter((c) => c.shop.slug === shop.slug).map((c) => c.id);
      const matches = mine(result.items);
      if (matches.length) return { ...base, text: t.photoYes, productIds: matches.slice(0, MAX_PRODUCTS), handoff: false };
      const related = mine(result.related);
      if (related.length) return { ...base, text: t.photoRelated, productIds: related.slice(0, MAX_PRODUCTS), handoff: false };
    } catch (e) {
      this.logger.warn(`Shop bot photo matching unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
    return { ...base, text: t.photoNone(shop.name), productIds: [], handoff: true };
  }

  private async paymentMethods(shop: ShopFacts, lang: ChatLocale) {
    const { paymentMethods } = await this.cms.publicSettings();
    // Transfers need the shop's bank account or QR (as at checkout).
    const usable = paymentMethods.filter((m) => m !== 'BANK_TRANSFER' || shop.transfer);
    return { names: usable.map((m) => PAYMENT_NAMES[m]?.[lang] ?? m), cod: usable.includes('COD') };
  }

  private async delivery(province: string | null, lang: ChatLocale): Promise<string> {
    const t = B[lang];
    const providers = await this.prisma.deliveryProvider.findMany({ where: { isActive: true }, select: { name: true, zones: { select: { provinces: true } } } });
    if (!province) return t.deliveryAll(providers.filter((p) => p.zones.length).map((p) => p.name));
    const couriers = providers.filter((p) => p.zones.some((z) => z.provinces.length === 0 || z.provinces.includes(province))).map((p) => p.name);
    const place = provinceName(province as Parameters<typeof provinceName>[0], lang);
    return couriers.length ? t.deliveryYes(place, couriers) : t.deliveryNo(place);
  }

  /** The shop's running coupons and flash-sale products, as text. */
  private async promotions(shop: ShopFacts, lang: ChatLocale): Promise<string> {
    const t = B[lang];
    const now = new Date();
    const coupons = await this.prisma.coupon.findMany({
      where: { shopId: shop.id, isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { code: true, type: true, value: true, minOrderAmount: true, usageLimit: true, usedCount: true },
      take: 5,
    });
    const usable = coupons.filter((c) => c.usageLimit === null || c.usedCount < c.usageLimit);
    const sale = (await this.products.flashSale(60)).items.filter((c) => c.shop.slug === shop.slug).slice(0, 5);
    if (!usable.length && !sale.length) return t.noPromotions;
    const lines = [
      ...usable.map((c) => t.coupon(c.code, c.type === 'PERCENTAGE' ? `${c.value.toNumber()}%` : formatMoney(c.value.toNumber(), lang), c.minOrderAmount ? formatMoney(c.minOrderAmount.toNumber(), lang) : null)),
      ...sale.map((c) => `• ${c.name} -${c.flashSale?.percent ?? 0}% (${price(c, lang)})`),
    ];
    return `${t.promotions}\n${lines.join('\n')}`;
  }

  // ─── Claude ────────────────────────────────────────────────────────────────

  /**
   * Claude reads the shop's facts and FAQ, decides whether the customer wants information or
   * products, searches this shop's catalog only for the latter, and ends its reply with which
   * results to show (if any).
   */
  private async aiAnswer(shop: ShopFacts, text: string, history: BotTurn[], focusId: string | null, lang: ChatLocale): Promise<BotAnswer> {
    const system = await this.systemPrompt(shop, focusId, lang);
    const messages: Message[] = [...conversation(history), { role: 'user', content: text || '…' }];
    let results: ProductCard[] = [];
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Last round: answer with what was found instead of searching again.
      const last = round === MAX_TOOL_ROUNDS - 1;
      const res = await this.claude.messages({ system, messages, tools: [SEARCH_TOOL], ...(last && { tool_choice: { type: 'none' } }), max_tokens: 500 });
      const calls = res.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || !calls.length) return parseAiReply(replyText(res), results, B[lang].handoff(shop.name));
      messages.push({ role: 'assistant', content: res.content });
      const out: ContentBlock[] = [];
      for (const call of calls) {
        const args = call.input as { keywords?: string[]; max_price?: number };
        const keywords = (args.keywords ?? []).filter((k) => typeof k === 'string' && k.trim()).slice(0, 8);
        let cards = await this.products.cardsByIds(await this.find(shop.id, keywords));
        if (typeof args.max_price === 'number') cards = cards.filter((c) => c.price <= args.max_price!);
        // Numbers continue across searches, so "SHOW:" can point at any of them.
        const start = results.length;
        results = [...results, ...cards.slice(0, 10)];
        out.push({
          type: 'tool_result',
          tool_use_id: call.id,
          content: cards.length ? cards.slice(0, 10).map((c, i) => `${start + i + 1}. ${c.name} — ${price(c, lang)}${c.flashSale ? ` (sale -${c.flashSale.percent}%)` : ''}`).join('\n') : 'No products found in this shop.',
        });
      }
      messages.push({ role: 'user', content: out });
    }
    return parseAiReply('', results, B[lang].handoff(shop.name));
  }

  private async systemPrompt(shop: ShopFacts, focusId: string | null, lang: ChatLocale): Promise<string> {
    const payment = await this.paymentMethods(shop, 'en');
    const focus = focusId ? (await this.products.cardsByIds([focusId]))[0] : undefined;
    const focusDetail = focus ? await this.options([focus.id]) : [];
    return [
      `You are the auto-reply assistant of "${shop.name}", a shop on Taladonline (an online marketplace in Laos), answering a customer in the shop's private chat.`,
      `Reply in the customer's language (Lao or English; default ${lang === 'lo' ? 'Lao' : 'English'}). Be short and friendly like a shop owner on a messaging app: 1–3 sentences.`,
      'First decide what the customer wants:',
      '- INFORMATION (opening hours, address, payment, delivery, promotions, policies, anything in the FAQ): answer only from the shop facts below. Do NOT search or show products.',
      '- PRODUCTS (looking for, or asking about the size/colour/price/stock of a product): call search_shop_products (words in English and Lao), then answer from the results only. Never invent products or prices.',
      '- Anything you cannot answer from these facts (an existing order, a return, a refund, a special request): say the shop will reply soon, and end with a line "HANDOFF".',
      'When products should be shown under your reply, end with a line "SHOW: 1, 3" (result numbers, most relevant first, at most 8). Omit it for information answers, and when you are telling the customer the shop doesn\'t have what they asked (nothing cheaper, not in that colour…) — never show products that don\'t fit the request.',
      'For broad requests (a gift, something for mom), search for 2–3 concrete kinds of product that fit, in one search.',
      '',
      'Shop facts:',
      `- Name: ${shop.name}`,
      shop.description ? `- About: ${shop.description.slice(0, 500)}` : '',
      `- Opening hours: ${describeHours(shop.hours, 'en') ?? 'not set'}`,
      `- Address: ${shop.address ?? 'not set'}`,
      `- Payment: ${payment.names.join(', ')} (chosen at checkout)`,
      `- Delivery: ${(await this.delivery(null, 'en')).replace(/\.$/, '')}`,
      `- Promotions: ${(await this.promotions(shop, 'en')).replace(/\n/g, ' ')}`,
      shop.faqs.length ? `\nThe shop's FAQ (use these answers when the question matches):\n${shop.faqs.map((f) => `Q: ${f.question}\nA: ${f.answer}`).join('\n')}` : '',
      focus
        ? `\nThe chat is about this product (if the customer says "this"/"it"): ${focus.name} — ${price(focus, 'en')}; options: ${JSON.stringify(focusDetail[0]?.variants.map((v) => v.attributes) ?? [])}; stock: ${focusDetail[0]?.variants.length ? focusDetail[0].variants.reduce((n, v) => n + v.stock, 0) : (focusDetail[0]?.stock ?? 0)}`
        : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }
}

const SEARCH_TOOL: Tool = {
  name: 'search_shop_products',
  description: "Search this shop's products. Give search words in BOTH English and Lao (product names may be in either), most specific first.",
  input_schema: {
    type: 'object',
    properties: {
      keywords: { type: 'array', items: { type: 'string' }, description: 'e.g. ["t-shirt", "ເສື້ອຍືດ"]' },
      max_price: { type: 'number', description: 'Optional maximum price in LAK (kip)' },
    },
    required: ['keywords'],
  },
};

/** Claude's reply without its "SHOW:" / "HANDOFF" lines, and the products it chose. */
export function parseAiReply(raw: string, results: { id: string }[], fallback: string): BotAnswer {
  const show = /^\s*SHOW:\s*([\d,\s]+)$/im.exec(raw);
  const handoff = /^\s*HANDOFF\s*$/im.test(raw);
  const text = raw.replace(/^\s*SHOW:.*$/gim, '').replace(/^\s*HANDOFF\s*$/gim, '').trim();
  const picks = show ? [...new Set(show[1].split(/[,\s]+/).map(Number))].flatMap((n) => (results[n - 1] ? [results[n - 1].id] : [])) : [];
  return { text: text || fallback, productIds: picks.slice(0, MAX_PRODUCTS), topic: 'ai', handoff, engine: 'ai' };
}

/** Earlier turns as alternating messages, starting with the customer (Claude requires it). */
function conversation(history: BotTurn[]): Message[] {
  const out: Message[] = [];
  for (const turn of history.slice(-10)) {
    const text = turn.text.trim().slice(0, 1000);
    if (!text) continue;
    if (!out.length && turn.role === 'assistant') continue;
    const last = out.at(-1);
    if (last && last.role === turn.role && typeof last.content === 'string') last.content += `\n${text}`;
    else out.push({ role: turn.role, content: text });
  }
  if (out.at(-1)?.role === 'user') out.push({ role: 'assistant', content: '…' });
  return out;
}

/** "Do you have / sell …", "I want …", "ມີ…ບໍ", "ຢາກໄດ້…": asking for a product. */
const asksForProduct = (text: string) =>
  /\b(do you (have|sell|carry)|have you got|looking for|i('m| am) looking|i want|i need|wanna buy|want to buy|selling)\b|ມີ.+ບໍ|ຢາກໄດ້|ຊອກຫາ|ຕ້ອງການ|ຂາຍ.+ບໍ/i.test(text);

const price = (c: Pick<ProductCard, 'price' | 'priceMax'>, lang: ChatLocale) => `${formatMoney(c.price, lang)}${c.priceMax ? ` – ${formatMoney(c.priceMax, lang)}` : ''}`;

const PAYMENT_NAMES: Record<string, Record<ChatLocale, string>> = {
  COD: { en: 'cash on delivery', lo: 'ຈ່າຍປາຍທາງ (ເງິນສົດ)' },
  BANK_TRANSFER: { en: 'bank transfer (QR)', lo: 'ໂອນຜ່ານ QR' },
};

/** Built-in replies, written as the shop. */
const B = {
  en: {
    greeting: (shop: string) => `Hi! 👋 Welcome to ${shop}. Ask me about our products, prices, delivery or payment — or send a photo of what you're looking for.`,
    thanks: "You're welcome! 😊 Anything else I can help with?",
    handoff: (shop: string) => `Thanks for your message! 🙏 ${shop} will reply to you here soon.`,
    order: (shop: string) => `Thanks — I've passed this to ${shop}. They'll check and reply to you here soon. 🙏`,
    hours: (h: string) => `Our opening hours: ${h}.`,
    location: (a: string) => `Our shop is at: ${a}`,
    payment: (m: string[]) => `You can pay by ${m.join(' or ')}. You choose at checkout.`,
    codOff: (m: string[]) => `Sorry, we don't take cash on delivery. You can pay by ${m.join(' or ')}.`,
    deliveryAll: (c: string[]) => (c.length ? `We deliver with ${c.join(', ')}. Tell me your province and I'll check.` : 'Delivery isn’t set up yet — the shop will reply soon.'),
    deliveryYes: (place: string, c: string[]) => `Yes, we deliver to ${place} with ${c.join(', ')}. You pay the delivery fee to the courier.`,
    deliveryNo: (place: string) => `Sorry, no courier delivers to ${place} yet.`,
    promotions: 'Yes! Our promotions right now:',
    coupon: (code: string, off: string, min: string | null) => `• Code ${code}: ${off} off${min ? ` (orders from ${min})` : ''}`,
    noPromotions: "Sorry, we don't have any promotions right now.",
    found: (q: string, n: number) => `Yes, we have ${q ? `${q} — ` : ''}${n} product${n === 1 ? '' : 's'}. Tap one to see details. 👇`,
    notFound: (q: string, shop: string) => `Sorry, ${shop} doesn't have ${q ? `“${q}”` : 'that'} right now.`,
    askWhich: 'Which product do you mean? Tell me its name, or open it and tap “Chat with shop”.',
    colorYes: (color: string, name: string) => `Yes, ${name} comes in ${color}.`,
    colorNo: (color: string, name: string, a: string[]) => `Sorry, ${name} doesn't come in ${color}.${a.length ? ` It comes in: ${a.join(', ')}.` : ''}`,
    sizeYes: (size: string, name: string) => `Yes, ${name} comes in ${size}.`,
    sizeNo: (size: string, name: string, a: string[]) => `Sorry, ${name} doesn't come in ${size}.${a.length ? ` Available: ${a.join(', ')}.` : ''}`,
    priceIntro: 'Here are the prices:',
    inStock: (name: string, n: number) => `Yes, ${name} is in stock (${n} left).`,
    soldOut: (name: string) => `Sorry, ${name} is sold out right now.`,
    cheaperYes: (name: string) => `Here are cheaper options than ${name}:`,
    cheaperNo: (name: string) => `Sorry, we don't have anything cheaper than ${name}.`,
    photoYes: 'Yes, we have this! 👇',
    photoRelated: "We don't have exactly this, but these are similar:",
    photoNone: (shop: string) => `Sorry, I couldn't find this in our shop. ${shop} will check and reply soon.`,
    orderCard: (name: string, n: number) => `Here's your order: ${n} × ${name} 👇 Check the options, address and payment, then tap “Place order”.`,
    orderCardChoose: (name: string) => `Here's your order for ${name} 👇 Tap the size you want and how many. Delivery, address and payment are filled in — tap any of them to change, then “Place order”.`,
    buyWhich: 'Which one would you like? Tap “Buy” under the product. 👇',
  },
  lo: {
    greeting: (shop: string) => `ສະບາຍດີ! 👋 ຍິນດີຕ້ອນຮັບສູ່ ${shop}. ຖາມກ່ຽວກັບສິນຄ້າ, ລາຄາ, ການຈັດສົ່ງ ຫຼື ການຈ່າຍເງິນໄດ້ເລີຍ — ຫຼື ສົ່ງຮູບສິນຄ້າທີ່ຊອກຫາມາ.`,
    thanks: 'ຍິນດີເດີ້! 😊 ມີຫຍັງໃຫ້ຊ່ວຍອີກບໍ່?',
    handoff: (shop: string) => `ຂອບໃຈສຳລັບຂໍ້ຄວາມ! 🙏 ${shop} ຈະຕອບກັບຢູ່ນີ້ໄວໆນີ້.`,
    order: (shop: string) => `ຂອບໃຈເດີ້ — ໄດ້ແຈ້ງໃຫ້ ${shop} ແລ້ວ. ຮ້ານຈະກວດເບິ່ງ ແລະ ຕອບກັບຢູ່ນີ້ໄວໆນີ້. 🙏`,
    hours: (h: string) => `ເວລາເປີດຮ້ານ: ${h}.`,
    location: (a: string) => `ຮ້ານຢູ່: ${a}`,
    payment: (m: string[]) => `ຈ່າຍໄດ້ດ້ວຍ ${m.join(' ຫຼື ')}. ເລືອກໄດ້ຕອນສັ່ງຊື້.`,
    codOff: (m: string[]) => `ຂໍອະໄພ, ຮ້ານບໍ່ຮັບຈ່າຍປາຍທາງ. ຈ່າຍໄດ້ດ້ວຍ ${m.join(' ຫຼື ')}.`,
    deliveryAll: (c: string[]) => (c.length ? `ພວກເຮົາຈັດສົ່ງກັບ ${c.join(', ')}. ບອກແຂວງຂອງທ່ານ ຈະກວດໃຫ້.` : 'ຍັງບໍ່ມີການຈັດສົ່ງ — ຮ້ານຈະຕອບກັບໄວໆນີ້.'),
    deliveryYes: (place: string, c: string[]) => `ສົ່ງຮອດ ${place} ໄດ້ເດີ້ ກັບ ${c.join(', ')}. ຄ່າສົ່ງຈ່າຍໃຫ້ບໍລິສັດຂົນສົ່ງ.`,
    deliveryNo: (place: string) => `ຂໍອະໄພ, ຍັງບໍ່ມີບໍລິສັດຂົນສົ່ງໄປ ${place}.`,
    promotions: 'ມີເດີ້! ໂປຣໂມຊັນຕອນນີ້:',
    coupon: (code: string, off: string, min: string | null) => `• ໂຄດ ${code}: ຫຼຸດ ${off}${min ? ` (ສັ່ງຕັ້ງແຕ່ ${min})` : ''}`,
    noPromotions: 'ຂໍອະໄພ, ຕອນນີ້ບໍ່ມີໂປຣໂມຊັນ.',
    found: (q: string, n: number) => `ມີເດີ້! ${q ? `${q} ` : ''}${n} ລາຍການ. ແຕະເພື່ອເບິ່ງລາຍລະອຽດ. 👇`,
    notFound: (q: string, shop: string) => `ຂໍອະໄພ, ຕອນນີ້ ${shop} ບໍ່ມີ ${q ? `“${q}”` : 'ສິນຄ້ານີ້'}.`,
    askWhich: 'ໝາຍເຖິງສິນຄ້າໃດ? ບອກຊື່ສິນຄ້າ ຫຼື ເປີດສິນຄ້າແລ້ວກົດ “ແຊັດກັບຮ້ານ”.',
    colorYes: (color: string, name: string) => `ມີເດີ້! ${name} ມີ${color}.`,
    colorNo: (color: string, name: string, a: string[]) => `ຂໍອະໄພ, ${name} ບໍ່ມີ${color}.${a.length ? ` ມີສີ: ${a.join(', ')}.` : ''}`,
    sizeYes: (size: string, name: string) => `ມີເດີ້! ${name} ມີໄຊ ${size}.`,
    sizeNo: (size: string, name: string, a: string[]) => `ຂໍອະໄພ, ${name} ບໍ່ມີໄຊ ${size}.${a.length ? ` ມີ: ${a.join(', ')}.` : ''}`,
    priceIntro: 'ນີ້ແມ່ນລາຄາ:',
    inStock: (name: string, n: number) => `ຍັງມີເດີ້! ${name} ເຫຼືອ ${n} ອັນ.`,
    soldOut: (name: string) => `ຂໍອະໄພ, ${name} ໝົດແລ້ວ.`,
    cheaperYes: (name: string) => `ນີ້ແມ່ນສິນຄ້າທີ່ຖືກກວ່າ ${name}:`,
    cheaperNo: (name: string) => `ຂໍອະໄພ, ບໍ່ມີສິນຄ້າທີ່ຖືກກວ່າ ${name}.`,
    photoYes: 'ມີເດີ້! 👇',
    photoRelated: 'ບໍ່ມີແບບນີ້ແທ້ໆ, ແຕ່ມີແບບທີ່ຄ້າຍກັນ:',
    photoNone: (shop: string) => `ຂໍອະໄພ, ບໍ່ພົບສິນຄ້ານີ້ໃນຮ້ານ. ${shop} ຈະກວດເບິ່ງ ແລະ ຕອບກັບໄວໆນີ້.`,
    orderCard: (name: string, n: number) => `ນີ້ແມ່ນຄຳສັ່ງຊື້ຂອງທ່ານ: ${name} × ${n} 👇 ກວດເບິ່ງຕົວເລືອກ, ທີ່ຢູ່ ແລະ ການຈ່າຍເງິນ ແລ້ວກົດ “ສັ່ງຊື້”.`,
    orderCardChoose: (name: string) => `ນີ້ແມ່ນຄຳສັ່ງຊື້ ${name} ຂອງທ່ານ 👇 ແຕະເລືອກຂະໜາດ ແລະ ຈຳນວນທີ່ຕ້ອງການ. ການຈັດສົ່ງ, ທີ່ຢູ່ ແລະ ການຈ່າຍເງິນ ເລືອກໃຫ້ແລ້ວ — ແຕະເພື່ອປ່ຽນໄດ້ ແລ້ວກົດ “ສັ່ງຊື້”.`,
    buyWhich: 'ຢາກໄດ້ອັນໃດ? ກົດ “ຊື້” ໃຕ້ສິນຄ້າໄດ້ເລີຍ 👇',
  },
} satisfies Record<ChatLocale, Record<string, unknown>>;

/** "The shop will reply" texts, so the bot doesn't say it twice in a row. */
const HANDOFF_TEXTS = {
  has: (text: string) => /will reply|ຈະຕອບກັບ/.test(text),
};

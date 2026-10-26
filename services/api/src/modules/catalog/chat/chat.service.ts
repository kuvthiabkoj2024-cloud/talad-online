import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { formatMoney, provinceName } from '@talad/shared';
import { CmsService } from '../../cms/cms.service.js';
import { analyse, stripBuyWords } from '../../messages/bot/shop-bot-text.js';
import { ChatOrdersService } from '../../orders/chat-orders.service.js';
import { detectIntent, normalizeSize, stripIntentWords, type Intent } from './chat-intents.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AnthropicService, replyText, type ContentBlock, type Message, type Tool } from '../../ai/anthropic.service.js';
import { ClipService } from '../image-search/clip.service.js';
import { ImageIndexService } from '../image-search/image-index.service.js';
import { PhotoSearchService } from '../image-search/photo-search.service.js';
import { ProductsService, type ProductCard } from '../products/products.service.js';
import { extractQuery, hasColor, isGreeting, isThanks, labelOf, replyLanguage, takeColor, toConcepts, type ChatLocale, type Color, type Concept } from './chat-text.js';

/** Market Chat shows up to this many product cards under a reply. */
const MAX_PRODUCTS = 20;
/** CLIP text→photo similarity: real matches score ≥ ~0.29, unrelated ones ≤ ~0.28 (demo catalog). */
const MIN_TEXT_VISUAL = 0.28;
const TEXT_VISUAL_WINDOW = 0.035;
const MAX_TOOL_ROUNDS = 3;

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatProduct extends ProductCard {
  /** True when it matches what was asked; false for "related" suggestions. */
  exact: boolean;
}

export interface ChatReply {
  reply: string;
  products: ChatProduct[];
  /** What the products are: exact matches, related ones, or nothing found. */
  quality: 'exact' | 'related' | 'none';
  /** Quick replies to tap. */
  suggestions: string[];
  /** `ai`: Claude wrote the reply; `basic`: the built-in assistant (no key, no credit, or an error). */
  engine: 'ai' | 'basic';
  /** The language the conversation is in (what the customer writes), for the app's labels. */
  lang: ChatLocale;
  /** Buy by chat: an order card the customer completes and places in the chat. */
  orderId?: string;
}

interface Found {
  cards: ChatProduct[];
  quality: ChatReply['quality'];
}

const SUGGESTIONS: Record<ChatLocale, string[]> = {
  lo: ['ກາເຟລາວ', 'ເສື້ອຜ້າ', 'ຫູຟັງໄຮ້ສາຍ', 'ອາຫານແມວ'],
  en: ['Lao coffee', 'T-shirt', 'Wireless earbuds', 'Gift ideas'],
};

const SEARCH_TOOL: Tool = {
  name: 'search_products',
  description:
    'Search the Taladonline catalog. Always call this before recommending products. Give search words in BOTH English and Lao (product names may be in either language). Returns the best matches, marked exact or related.',
  input_schema: {
    type: 'object',
    properties: {
      keywords_en: { type: 'array', items: { type: 'string' }, description: '1-5 English search words/phrases, most specific first, e.g. ["wireless earbuds", "headphones"]' },
      keywords_lo: { type: 'array', items: { type: 'string' }, description: 'The same in Lao, e.g. ["ຫູຟັງໄຮ້ສາຍ", "ຫູຟັງ"]' },
      category: { type: 'string', description: 'Optional catalog category slug from the list in the system prompt' },
      max_price: { type: 'number', description: 'Optional maximum price in LAK (kip)' },
    },
    required: ['keywords_en', 'keywords_lo'],
  },
};

/**
 * Market Chat (§5 shop by chat): ask in Lao or English, or send a photo, and get a short reply
 * with product cards — exact matches first, then related ones. Claude answers when
 * configured; otherwise (or when it fails) a built-in assistant does.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductsService,
    private readonly clip: ClipService,
    private readonly index: ImageIndexService,
    private readonly photos: PhotoSearchService,
    private readonly claude: AnthropicService,
    private readonly cms: CmsService,
    private readonly chatOrders: ChatOrdersService,
  ) {}

  /**
   * One turn. Signed in (`customerId`): the conversation is this account's saved history
   * (never what the browser sends), and both messages are saved to it.
   */
  async reply(input: {
    message: string;
    history: ChatTurn[];
    locale: ChatLocale;
    photo?: Express.Multer.File;
    customerId?: string;
    thumb?: string;
  }): Promise<ChatReply> {
    const history = input.customerId ? await this.savedTurns(input.customerId) : input.history;
    const lang = replyLanguage(input.message, history, input.locale);
    const buy = input.photo ? null : await this.buyReply(input.message, input.customerId, lang);
    const out: ChatReply = { ...(buy ?? (await this.answer({ ...input, history }, lang))), lang };
    if (input.customerId) {
      // Explicit times keep the question before its answer.
      const at = Date.now();
      await this.prisma.assistantMessage.createMany({
        data: [
          { customerId: input.customerId, role: 'user', text: input.message.trim().slice(0, 500), imageThumb: input.thumb ?? null, createdAt: new Date(at) },
          { customerId: input.customerId, role: 'assistant', text: out.reply, products: out.products as unknown as object, lang, chatOrderId: out.orderId ?? null, createdAt: new Date(at + 1) },
        ],
      });
    }
    return out;
  }

  /** This account's Market Chat (oldest first, last 40 messages). */
  async history(customerId: string) {
    const rows = await this.prisma.assistantMessage.findMany({ where: { customerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 40 });
    return rows.reverse().map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      text: m.text,
      image: m.imageThumb ?? undefined,
      products: (m.products as ChatProduct[] | null) ?? undefined,
      lang: (m.lang as ChatLocale | null) ?? undefined,
      orderId: m.chatOrderId ?? undefined,
      createdAt: m.createdAt,
    }));
  }

  /** "Buy now" on a product in Market Chat: an order card in the chat (saved to the account). */
  async startOrder(customerId: string, item: { productId: string; variantId: string | null; quantity: number }, lang: ChatLocale) {
    const product = await this.prisma.product.findFirst({ where: { id: item.productId, status: 'PUBLISHED' }, select: { name: true, shopId: true } });
    if (!product) throw new BadRequestException({ code: 'PRODUCT_UNAVAILABLE', message: 'Product not available' });
    const order = await this.chatOrders.create({ customerId, shopId: product.shopId, items: [item], source: 'MARKET_CHAT', createdBy: 'ASSISTANT' });
    const text = T[lang].orderCard(product.name, item.quantity);
    const row = await this.prisma.assistantMessage.create({ data: { customerId, role: 'assistant', text, lang, chatOrderId: order.id } });
    return { id: row.id, role: 'assistant' as const, text, lang, orderId: order.id, createdAt: row.createdAt };
  }

  /**
   * "I'll take the Bolaven coffee" / "ຢາກຊື້ກາເຟ 2 ຖົງ": one clear product → an order card;
   * several → show them to pick from. Guests are asked to sign in. Null when it isn't about buying
   * (or nothing matches), so the normal reply takes over.
   */
  private async buyReply(message: string, customerId: string | undefined, lang: ChatLocale): Promise<Omit<ChatReply, 'lang'> | null> {
    const topic = analyse(message);
    if (topic.kind !== 'buy') return null;
    const base = { suggestions: [] as string[], engine: 'basic' as const };
    const words = extractQuery(stripIntentWords(takeColor(stripBuyWords(message)).rest)).keywords;
    let ids: string[] = [];
    if (words.length) {
      const concepts = toConcepts(words);
      ids = await this.products.matchAll(concepts.map((c) => c.alternatives), 6);
    } else if (customerId) {
      // "I'll take it": the product of the last reply, when it showed exactly one.
      const last = await this.prisma.assistantMessage.findFirst({ where: { customerId, role: 'assistant', products: { not: Prisma.DbNull } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { products: true } });
      const shown = (last?.products as ChatProduct[] | null) ?? [];
      ids = shown.length === 1 ? [shown[0].id] : shown.filter((p) => p.exact).map((p) => p.id).slice(0, 6);
    }
    if (!ids.length) return null;
    const cards = (await this.products.cardsByIds(ids)).map((c) => ({ ...c, exact: true }));
    if (!cards.length) return null;
    if (!customerId) return { ...base, reply: T[lang].signInToOrder, products: cards, quality: 'exact' };
    if (cards.length > 1) return { ...base, reply: T[lang].buyWhich, products: cards, quality: 'exact' };
    try {
      const order = await this.chatOrders.create({ customerId, shopId: (await this.prisma.product.findUniqueOrThrow({ where: { id: cards[0].id }, select: { shopId: true } })).shopId, items: [{ productId: cards[0].id, variantId: null, quantity: topic.quantity }], source: 'MARKET_CHAT', createdBy: 'ASSISTANT' });
      return { ...base, reply: T[lang].orderCard(cards[0].name, topic.quantity), products: [], quality: 'none', orderId: order.id };
    } catch {
      return { ...base, reply: T[lang].cannotOrder, products: cards, quality: 'exact' };
    }
  }

  /** "New chat": forget this account's Market Chat. */
  async clear(customerId: string) {
    await this.prisma.assistantMessage.deleteMany({ where: { customerId } });
  }

  private async savedTurns(customerId: string): Promise<ChatTurn[]> {
    const rows = await this.prisma.assistantMessage.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 12,
      select: { role: true, text: true, imageThumb: true },
    });
    return rows.reverse().map((r) => ({ role: r.role as ChatTurn['role'], text: r.imageThumb ? `[photo] ${r.text}`.trim() : r.text }));
  }

  private async answer(input: { message: string; history: ChatTurn[]; locale: ChatLocale; photo?: Express.Multer.File }, lang: ChatLocale): Promise<Omit<ChatReply, 'lang'>> {
    const message = input.message.trim().slice(0, 500);
    if (!message && !input.photo) throw new BadRequestException({ code: 'EMPTY_MESSAGE', message: 'Type a message or attach a photo' });

    if (input.photo) return this.photoReply(input.photo, message, input.history, lang);
    if (this.claude.enabled) {
      try {
        return await this.aiReply(message, input.history, lang);
      } catch (e) {
        this.logger.warn(`Market Chat AI reply failed, using the basic assistant: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return this.basicReply(message, input.history, lang);
  }

  /** Built-in assistant: greetings, then exact → related → nothing, with a templated reply. */
  private async basicReply(message: string, history: ChatTurn[], lang: ChatLocale): Promise<Omit<ChatReply, 'lang'>> {
    const base = { suggestions: SUGGESTIONS[lang], engine: 'basic' as const };
    if (isGreeting(message)) return { ...base, reply: T[lang].greeting, products: [], quality: 'none' };
    if (isThanks(message)) return { ...base, reply: T[lang].thanks, products: [], quality: 'none' };
    const { color, rest } = takeColor(message);
    if (color) return this.colorReply(color, rest, history, lang);
    const intent = detectIntent(message);
    if (intent) return this.intentReply(intent, message, history, lang);
    const query = extractQuery(message);
    if (!query.keywords.length) return { ...base, reply: T[lang].askWhat, products: [], quality: 'none' };
    // Exact = every concept asked for (Lao or English); if none, drop describing words the
    // glossary doesn't know ("Lao coffee" → coffee). Single words alone only count as related.
    const concepts = toConcepts(query.keywords);
    const fallback = concepts.filter((c) => c.known);
    const exact = [concepts, ...(fallback.length && fallback.length < concepts.length ? [fallback] : [])];
    const found = await this.find(exact, concepts.flatMap((c) => c.alternatives), null, query.maxPrice);
    const q = query.keywords.join(' ');
    const exactCount = found.cards.filter((c) => c.exact).length;
    const reply =
      found.quality === 'exact'
        ? T[lang].exact(q, exactCount) + (found.cards.length > exactCount ? T[lang].alsoRelated : '')
        : found.quality === 'related'
          ? T[lang].related(q)
          : T[lang].none(q);
    // Nothing found: just say so (no unrelated products), with example questions to try.
    if (found.quality === 'none') return { ...base, reply, products: [], quality: 'none' };
    return { ...base, reply, products: found.cards, quality: found.quality, suggestions: [] };
  }

  /**
   * "ມີສີບົວບໍ?" / "in pink?": the colour applies to what's named in the message, or — for a
   * follow-up — to what the customer asked about before. Only products that come in that
   * colour are shown; otherwise a plain "sorry, not in pink" (with the colours there are).
   */
  private async colorReply(color: Color, rest: string, history: ChatTurn[], lang: ChatLocale): Promise<Omit<ChatReply, 'lang'>> {
    const base = { suggestions: [], engine: 'basic' as const };
    const found0 = this.subject(rest, history);
    const colorName = lang === 'lo' ? color.lo : color.en;
    if (!found0) return { ...base, reply: T[lang].colorWhich(colorName), products: [], quality: 'none' };
    const subject = { ...found0, words: labelOf(found0.concepts, lang) || found0.words };

    const { ids, options } = await this.subjectProducts(subject);
    const values = (p: (typeof options)[number]) => p.variants.flatMap((v) => Object.values(v.attributes).map(String));
    const inColor = options.filter((p) => hasColor(color, [p.name, p.description ?? '', ...values(p)]));
    if (inColor.length) {
      const cards = (await this.products.cardsByIds(ids.filter((id) => inColor.some((p) => p.id === id)))).map((c) => ({ ...c, exact: true }));
      return { ...base, reply: T[lang].colorYes(colorName, subject.words), products: cards, quality: 'exact' };
    }
    // Colours the product does come in, from options named "color"/"colour"/"ສີ".
    const available = [
      ...new Set(
        options.flatMap((p) =>
          p.variants.flatMap((v) =>
            Object.entries(v.attributes)
              .filter(([k]) => /colou?r|ສີ/i.test(k))
              .map(([, val]) => String(val)),
          ),
        ),
      ),
    ];
    return { ...base, reply: T[lang].colorNo(colorName, subject.words, available), products: [], quality: 'none' };
  }

  /** Payment, delivery, promotions, size, price, stock and "cheaper?" questions. */
  private async intentReply(intent: Intent, message: string, history: ChatTurn[], lang: ChatLocale): Promise<Omit<ChatReply, 'lang'>> {
    const t = T[lang];
    const base = { suggestions: [] as string[], engine: 'basic' as const };
    const say = (reply: string, products: ChatProduct[] = [], quality: ChatReply['quality'] = products.length ? 'exact' : 'none') => ({ ...base, reply, products, quality });

    if (intent.kind === 'payment') {
      const { paymentMethods } = await this.cms.publicSettings();
      const names = paymentMethods.map((m) => PAYMENT_NAMES[m]?.[lang] ?? m);
      const askedCod = /\bcod\b|cash on delivery|ປາຍທາງ/i.test(message);
      if (askedCod && !paymentMethods.includes('COD')) return say(t.codOff(names));
      return say(t.payment(names));
    }
    if (intent.kind === 'delivery') {
      const providers = await this.prisma.deliveryProvider.findMany({ where: { isActive: true }, select: { name: true, zones: { select: { provinces: true } } } });
      const serving = (code: string) => providers.filter((p) => p.zones.some((z) => z.provinces.length === 0 || z.provinces.includes(code)));
      if (!intent.province) return say(t.deliveryAll(providers.filter((p) => p.zones.length).map((p) => p.name)));
      const place = provinceName(intent.province, lang);
      const couriers = serving(intent.province).map((p) => p.name);
      return say(couriers.length ? t.deliveryYes(place, couriers) : t.deliveryNo(place));
    }
    if (intent.kind === 'discount') {
      const sale = await this.products.flashSale(8);
      return sale.items.length ? say(t.discountYes, sale.items.map((c) => ({ ...c, exact: true }))) : say(t.discountNo);
    }

    // The rest are about a product: named now, or the one asked about before.
    const found0 = this.subject(stripIntentWords(message), history);
    if (!found0) return say(t.askWhat);
    // Name the product in the reply's language ("size XXL?" after "ເສື້ອຍືດ" → "the t-shirt").
    const subject = { ...found0, words: labelOf(found0.concepts, lang) || found0.words };
    const { ids, options } = await this.subjectProducts(subject);
    if (!ids.length) return say(t.none(subject.words));
    const cards = (await this.products.cardsByIds(ids)).map((c) => ({ ...c, exact: true }));

    if (intent.kind === 'size') {
      const sizesOf = (p: (typeof options)[number]) => p.variants.flatMap((v) => Object.values(v.attributes).map((x) => normalizeSize(String(x))));
      const fits = options.filter((p) => sizesOf(p).includes(intent.size)).map((p) => p.id);
      if (fits.length) return say(t.sizeYes(intent.size, subject.words), cards.filter((c) => fits.includes(c.id)));
      const available = [...new Set(options.flatMap(sizesOf))];
      return say(t.sizeNo(intent.size, subject.words, available));
    }
    if (intent.kind === 'price') {
      const lines = cards.slice(0, 3).map((c) => `${c.name}: ${formatMoney(c.price, lang)}${c.priceMax ? ` – ${formatMoney(c.priceMax, lang)}` : ''}`);
      return say(`${t.priceIntro}\n${lines.join('\n')}`, cards.slice(0, 6));
    }
    if (intent.kind === 'stock') {
      const units = (p: (typeof options)[number]) => (p.variants.length ? p.variants.reduce((n, v) => n + v.stock, 0) : p.stock);
      const inStock = options.filter((p) => units(p) > 0);
      if (!inStock.length) return say(t.soldOut(subject.words));
      const total = inStock.reduce((n, p) => n + units(p), 0);
      return say(t.inStock(subject.words, total), cards.filter((c) => inStock.some((p) => p.id === c.id)));
    }
    // Cheaper: the same kind of product (every known concept), below the price of the top match.
    const known = subject.concepts.filter((c) => c.known);
    const sameKind = await this.products.matchAll((known.length ? known : subject.concepts).map((c) => c.alternatives), 60);
    const reference = cards[0].price;
    const found = (await this.products.cardsByIds(sameKind)).filter((c) => c.price < reference).sort((a, b) => a.price - b.price);
    return found.length ? say(t.cheaperYes(subject.words), found.slice(0, MAX_PRODUCTS).map((c) => ({ ...c, exact: true }))) : say(t.cheaperNo(subject.words));
  }

  /**
   * What a message is about: product words in it, or — for a follow-up like "how much?" —
   * the product the customer asked about most recently.
   */
  private subject(text: string, history: ChatTurn[]): { words: string; concepts: Concept[] } | null {
    const of = (t: string) => {
      const q = extractQuery(stripIntentWords(takeColor(t).rest));
      const concepts = toConcepts(q.keywords);
      return concepts.some((c) => c.known) ? { words: q.keywords.join(' '), concepts } : null;
    };
    return (
      of(text) ??
      [...history]
        .reverse()
        .filter((t) => t.role === 'user')
        .map((t) => of(t.text))
        .find(Boolean) ??
      null
    );
  }

  /** Products for a subject (every concept; then only the known ones), with their options. */
  private async subjectProducts(subject: { concepts: Concept[] }) {
    const known = subject.concepts.filter((c) => c.known);
    let ids = await this.products.matchAll(subject.concepts.map((c) => c.alternatives), MAX_PRODUCTS);
    if (!ids.length && known.length) ids = await this.products.matchAll(known.map((c) => c.alternatives), MAX_PRODUCTS);
    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, description: true, stock: true, categoryId: true, variants: { select: { attributes: true, stock: true } } },
    });
    const options = rows.map((p) => ({ ...p, variants: p.variants.map((v) => ({ ...v, attributes: (v.attributes ?? {}) as Record<string, unknown> })) }));
    return { ids, options };
  }

  /** Claude with a catalog search tool: understands the question (Lao or English) and answers in kind. */
  private async aiReply(message: string, history: ChatTurn[], lang: ChatLocale): Promise<Omit<ChatReply, 'lang'>> {
    const messages: Message[] = [...conversation(history), { role: 'user', content: message }];
    let found: Found = { cards: [], quality: 'none' };
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      // Last round: answer with what was found instead of searching again.
      const last = round === MAX_TOOL_ROUNDS - 1;
      const res = await this.claude.messages({ system: await this.systemPrompt(lang), messages, tools: [SEARCH_TOOL], ...(last && { tool_choice: { type: 'none' } }), max_tokens: 600 });
      const calls = res.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      if (res.stop_reason !== 'tool_use' || !calls.length) {
        return { reply: replyText(res) || T[lang].askWhat, products: found.cards, quality: found.quality, suggestions: [], engine: 'ai' };
      }
      messages.push({ role: 'assistant', content: res.content });
      const results: ContentBlock[] = [];
      for (const call of calls) {
        const args = call.input as { keywords_en?: string[]; keywords_lo?: string[]; category?: string; max_price?: number };
        const keywords = [...(args.keywords_en ?? []), ...(args.keywords_lo ?? [])].filter((k) => typeof k === 'string' && k.trim()).slice(0, 10);
        // Each phrase Claude gives is one way to find it: a product matches if it has all its words.
        const phrases = keywords.slice(0, 6).map((phrase): Concept[] => phrase.split(/\s+/).map((w) => ({ alternatives: [w], known: true })));
        found = await this.find(phrases, keywords, args.category ?? null, typeof args.max_price === 'number' ? args.max_price : null, (args.keywords_en ?? []).join(', '));
        results.push({ type: 'tool_result', tool_use_id: call.id, content: describeForModel(found, lang) });
      }
      messages.push({ role: 'user', content: results });
    }
    // Out of rounds: still show what was found.
    return { reply: found.cards.length ? T[lang].exact('', found.cards.length) : T[lang].none(''), products: found.cards, quality: found.quality, suggestions: [], engine: 'ai' };
  }

  /** A photo: the 20 most related products (visual + Claude's description), then a short reply. */
  private async photoReply(photo: Express.Multer.File, message: string, history: ChatTurn[], lang: ChatLocale): Promise<Omit<ChatReply, 'lang'>> {
    const result = await this.photos.search(photo, { limit: MAX_PRODUCTS });
    // Matches first (exact when close), then related products — up to 20 in all.
    const cards: ChatProduct[] = [
      ...result.items.map(({ match, ...c }) => ({ ...c, exact: match.strong })),
      ...result.related.map(({ match: _match, ...c }) => ({ ...c, exact: false })),
    ].slice(0, MAX_PRODUCTS);
    const quality: Found['quality'] = !cards.length ? 'none' : cards.some((c) => c.exact) ? 'exact' : 'related';
    const exactCount = cards.filter((c) => c.exact).length;
    const fallback =
      quality === 'none'
        ? T[lang].photoNone
        : quality === 'exact'
          ? T[lang].photoExact(exactCount, result.label) + (cards.length > exactCount ? T[lang].alsoRelated : '')
          : T[lang].photoRelated(cards.length, result.label);
    if (!this.claude.enabled) return { reply: fallback, products: cards, quality, suggestions: [], engine: 'basic' };
    try {
      const res = await this.claude.messages({
        system: await this.systemPrompt(lang),
        max_tokens: 400,
        messages: [
          ...conversation(history),
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: photo.mimetype, data: photo.buffer.toString('base64') } },
              {
                type: 'text',
                text: `${message || '(The customer sent this photo without a message.)'}\n\n[Catalog results from comparing this photo with product photos, most similar first]\n${describeForModel({ cards, quality }, lang)}`,
              },
            ],
          },
        ],
      });
      return { reply: replyText(res) || fallback, products: cards, quality, suggestions: [], engine: 'ai' };
    } catch (e) {
      this.logger.warn(`Market Chat photo reply failed, using the basic assistant: ${e instanceof Error ? e.message : String(e)}`);
      return { reply: fallback, products: cards, quality, suggestions: [], engine: 'basic' };
    }
  }

  /**
   * Exact matches (products matching every concept of one of the `exact` sets, tried in
   * order until one finds something), then products sharing any of the `any` words or the
   * category, then — for English — products whose photos look like the words.
   */
  private async find(exact: Concept[][], any: string[], category: string | null, maxPrice: number | null, englishText?: string): Promise<Found> {
    const keywords = any;
    const exactIds = new Set<string>();
    for (const set of exact.filter((c) => c.length)) {
      for (const id of await this.products.matchAll(set.map((c) => c.alternatives), MAX_PRODUCTS)) exactIds.add(id);
      if (exactIds.size) break;
    }
    const partial = await this.products.keywordMatches(keywords, category, MAX_PRODUCTS * 2);
    let visual: string[] = [];
    const english = englishText ?? keywords.filter((k) => !/[຀-໿]/.test(k)).join(', ');
    if (english && this.clip.enabled) {
      try {
        const hits = await this.index.similar(await this.clip.embedText(english), MAX_PRODUCTS, MIN_TEXT_VISUAL);
        visual = hits.filter((h) => h.score >= hits[0].score - TEXT_VISUAL_WINDOW).map((h) => h.productId);
      } catch (e) {
        this.logger.warn(`Text→photo matching unavailable: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    const ordered = [...new Set([...exactIds, ...partial.map((p) => p.productId), ...visual])];
    let cards = await this.products.cardsByIds(ordered);
    if (maxPrice) cards = cards.filter((c) => c.price <= maxPrice);
    const out = cards.slice(0, MAX_PRODUCTS).map((c) => ({ ...c, exact: exactIds.has(c.id) }));
    return { cards: out, quality: !out.length ? 'none' : out.some((c) => c.exact) ? 'exact' : 'related' };
  }

  private async systemPrompt(lang: ChatLocale): Promise<string> {
    const cats = await this.prisma.category.findMany({ where: { isActive: true }, select: { slug: true, name: true } });
    const list = cats.map((c) => {
      const n = c.name as { en?: string; lo?: string };
      return `${c.slug} (${n.en ?? ''} / ${n.lo ?? ''})`;
    });
    return [
      'You are "Market Chat" (ແຊັດຕະຫຼາດ in Lao), the friendly shopping assistant of Taladonline, an online marketplace for local shops in Laos.',
      `Reply in the customer's language: Lao if they write in Lao, English if they write in English (app language: ${lang === 'lo' ? 'Lao' : 'English'}).`,
      'Keep replies short and chatty, like a helpful shop assistant on a messaging app: 1–3 sentences, an emoji at most.',
      'For any product question, call search_products first, with words in both English and Lao. Never invent products, prices or shops — only mention what the tool returned.',
      'Product names are concrete ("silk scarf", "coffee beans"), so for broad requests (a gift, something for mom, a souvenir) search for 2–3 concrete kinds of product that fit, in one search, rather than the broad word itself.',
      'If results are only "related", say you could not find exactly that and suggest the related ones. If nothing is found, say so and suggest other words or sending a photo.',
      'Follow-ups refer to the conversation ("in pink?" = the product discussed). If a requested colour, size or option is not available, just say sorry, it is not available (and which options exist) — do not suggest unrelated products.',
      'The app shows the product cards under your message, so mention at most 3 products by name (with price in kip, ₭) instead of listing them all.',
      'You may ask one short question to narrow down (size, budget, use). Politely decline topics unrelated to shopping on Taladonline.',
      `Catalog categories: ${list.join('; ')}`,
    ].join('\n');
  }
}

/** Earlier turns as alternating messages, starting with the customer (Claude requires it). */
function conversation(history: ChatTurn[]): Message[] {
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

/** Compact result list for Claude (it never sees ids or URLs). */
function describeForModel({ cards, quality }: Found, lang: ChatLocale): string {
  if (!cards.length) return 'No products found.';
  const lines = cards.slice(0, 12).map(
    (c, i) =>
      `${i + 1}. ${c.name} — ${formatMoney(c.price, lang)}${c.priceMax ? `–${formatMoney(c.priceMax, lang)}` : ''} — shop: ${c.shop.name} — ${c.soldCount} sold${c.ratingAvg ? `, rating ${c.ratingAvg.toFixed(1)}` : ''}${c.flashSale ? ` — flash sale -${c.flashSale.percent}%` : ''} — ${c.exact ? 'exact match' : 'related'}`,
  );
  return `${quality === 'exact' ? 'Matches found' : 'No exact match; related products'} (${cards.length} total, showing ${lines.length}):\n${lines.join('\n')}`;
}

const PAYMENT_NAMES: Record<string, Record<ChatLocale, string>> = {
  // Each shop decides whether it offers COD.
  COD: { en: 'cash on delivery (at shops that offer it)', lo: 'ຈ່າຍປາຍທາງ (ເງິນສົດ, ສະເພາະຮ້ານທີ່ເປີດໃຫ້)' },
  BANK_TRANSFER: { en: 'bank transfer (QR)', lo: 'ໂອນຜ່ານ QR' },
};

/** Built-in replies (no AI). */
const T: Record<
  ChatLocale,
  {
    greeting: string;
    thanks: string;
    askWhat: string;
    exact: (q: string, n: number) => string;
    alsoRelated: string;
    colorYes: (color: string, subject: string) => string;
    colorNo: (color: string, subject: string, available: string[]) => string;
    colorWhich: (color: string) => string;
    payment: (methods: string[]) => string;
    codOff: (methods: string[]) => string;
    deliveryAll: (couriers: string[]) => string;
    deliveryYes: (place: string, couriers: string[]) => string;
    deliveryNo: (place: string) => string;
    discountYes: string;
    discountNo: string;
    sizeYes: (size: string, subject: string) => string;
    sizeNo: (size: string, subject: string, available: string[]) => string;
    priceIntro: string;
    inStock: (subject: string, units: number) => string;
    soldOut: (subject: string) => string;
    cheaperYes: (subject: string) => string;
    cheaperNo: (subject: string) => string;
    related: (q: string) => string;
    none: (q: string) => string;
    photoExact: (n: number, label: string | null) => string;
    photoRelated: (n: number, label: string | null) => string;
    photoNone: string;
    orderCard: (name: string, n: number) => string;
    buyWhich: string;
    signInToOrder: string;
    cannotOrder: string;
  }
> = {
  en: {
    greeting: "Hi! 👋 I'm Market Chat. Tell me what you're looking for — or send a photo — and I'll find it from shops across Laos.",
    thanks: "You're welcome! 😊 Anything else you're looking for?",
    askWhat: 'What are you looking for? Type a product name, or send me a photo of it.',
    exact: (q, n) => (q ? `Here's what I found for “${q}” — ${n} product${n === 1 ? '' : 's'}. Tap one for details.` : `I found ${n} product${n === 1 ? '' : 's'} for you.`),
    alsoRelated: ' I added some related products too.',
    colorYes: (color, subject) => `Yes! Here's ${subject ? `the ${subject}` : 'what we have'} in ${color}:`,
    colorNo: (color, subject, available) =>
      `Sorry, we don't have ${subject ? `the ${subject}` : 'that'} in ${color} right now.${available.length ? ` It comes in: ${available.join(', ')}.` : ''}`,
    colorWhich: (color) => `Which product would you like in ${color}?`,
    payment: (m) => `You can pay by ${m.join(' or ')}. You choose at checkout.`,
    codOff: (m) => `Sorry, cash on delivery isn't available right now. You can pay by ${m.join(' or ')}.`,
    deliveryAll: (c) => (c.length ? `We deliver with ${c.join(', ')}. Tell me your province and I'll check who delivers there.` : "Sorry, delivery isn't set up yet."),
    deliveryYes: (place, c) => `Yes, we deliver to ${place} with ${c.join(', ')}. You pay the delivery fee to the courier.`,
    deliveryNo: (place) => `Sorry, no courier delivers to ${place} yet.`,
    discountYes: 'Yes! These are on sale right now:',
    discountNo: 'Sorry, there are no promotions running right now.',
    sizeYes: (size, subject) => `Yes, ${subject ? `the ${subject}` : 'it'} comes in ${size}:`,
    sizeNo: (size, subject, a) => `Sorry, ${subject ? `the ${subject}` : 'it'} doesn't come in ${size}.${a.length ? ` Available: ${a.join(', ')}.` : ''}`,
    priceIntro: 'Here are the prices:',
    inStock: (subject, n) => `Yes, ${subject ? `the ${subject} is` : "it's"} in stock (${n} left).`,
    soldOut: (subject) => `Sorry, ${subject ? `the ${subject} is` : "it's"} sold out right now.`,
    cheaperYes: (subject) => `Here are cheaper options${subject ? ` than the ${subject}` : ''}:`,
    cheaperNo: (subject) => `Sorry, there's nothing cheaper${subject ? ` than the ${subject}` : ''} right now.`,
    related: (q) => `I couldn't find exactly “${q}”, but here are related products:`,
    none: (q) => `Sorry, I couldn't find ${q ? `“${q}”` : 'that'} yet. Try other words, or send me a photo of it. 📷`,
    photoExact: (n, label) => `${label ? `Looks like ${label}! ` : ''}${n === 1 ? 'Here’s a product that matches' : `Here are ${n} products that match`} your photo.`,
    photoRelated: (n, label) => `${label ? `Looks like ${label}. ` : ''}No exact match, but here ${n === 1 ? 'is a related product' : `are ${n} related products`}.`,
    photoNone: "I couldn't find anything like this photo yet. Try another angle, or tell me what it is.",
    orderCard: (name, n) => `Here's your order: ${n} × ${name} 👇 Check the options, address and payment, then tap “Place order”.`,
    buyWhich: 'Which one would you like? Tap “Buy now” under it. 👇',
    signInToOrder: 'Sign in to order in the chat — or tap “Buy now” under the product. 👇',
    cannotOrder: 'Sorry, this one can’t be ordered right now. Tap it for details. 👇',
  },
  lo: {
    greeting: 'ສະບາຍດີ! 👋 ຂ້ອຍແມ່ນ ແຊັດຕະຫຼາດ. ບອກສິ່ງທີ່ທ່ານຊອກຫາ ຫຼື ສົ່ງຮູບມາ — ຂ້ອຍຈະຊອກໃຫ້ຈາກຮ້ານທົ່ວປະເທດລາວ.',
    thanks: 'ຍິນດີເດີ້! 😊 ຢາກໄດ້ຫຍັງອີກບໍ່?',
    askWhat: 'ທ່ານຊອກຫາຫຍັງ? ພິມຊື່ສິນຄ້າ ຫຼື ສົ່ງຮູບມາໄດ້ເລີຍ.',
    exact: (q, n) => (q ? `ນີ້ແມ່ນສິນຄ້າ “${q}” ທີ່ພົບ ${n} ລາຍການ. ແຕະເພື່ອເບິ່ງລາຍລະອຽດ.` : `ພົບ ${n} ລາຍການໃຫ້ທ່ານ.`),
    alsoRelated: ' ມີສິນຄ້າທີ່ກ່ຽວຂ້ອງໃຫ້ເບິ່ງນຳ.',
    colorYes: (color, subject) => `ມີເດີ້! ນີ້ແມ່ນ${subject ? ` ${subject}` : 'ສິນຄ້າ'} ${color}:`,
    colorNo: (color, subject, available) =>
      `ຂໍອະໄພ, ຕອນນີ້ບໍ່ມີ${subject ? ` ${subject}` : 'ສິນຄ້ານີ້'} ${color}.${available.length ? ` ມີສີ: ${available.join(', ')}.` : ''}`,
    colorWhich: (color) => `ທ່ານຢາກໄດ້ສິນຄ້າໃດ ${color}?`,
    payment: (m) => `ຈ່າຍໄດ້ດ້ວຍ ${m.join(' ຫຼື ')}. ເລືອກໄດ້ຕອນສັ່ງຊື້.`,
    codOff: (m) => `ຂໍອະໄພ, ຕອນນີ້ຍັງບໍ່ຮອງຮັບການຈ່າຍປາຍທາງ. ຈ່າຍໄດ້ດ້ວຍ ${m.join(' ຫຼື ')}.`,
    deliveryAll: (c) => (c.length ? `ພວກເຮົາຈັດສົ່ງກັບ ${c.join(', ')}. ບອກແຂວງຂອງທ່ານ ຂ້ອຍຈະກວດໃຫ້ວ່າສົ່ງຮອດບໍ່.` : 'ຂໍອະໄພ, ຍັງບໍ່ມີການຈັດສົ່ງ.'),
    deliveryYes: (place, c) => `ສົ່ງຮອດ ${place} ໄດ້ເດີ້ ກັບ ${c.join(', ')}. ຄ່າສົ່ງຈ່າຍໃຫ້ບໍລິສັດຂົນສົ່ງ.`,
    deliveryNo: (place) => `ຂໍອະໄພ, ຍັງບໍ່ມີບໍລິສັດຂົນສົ່ງໄປ ${place}.`,
    discountYes: 'ມີເດີ້! ສິນຄ້າເຫຼົ່ານີ້ກຳລັງຫຼຸດລາຄາ:',
    discountNo: 'ຂໍອະໄພ, ຕອນນີ້ບໍ່ມີໂປຣໂມຊັນ.',
    sizeYes: (size, subject) => `ມີເດີ້! ${subject || 'ສິນຄ້ານີ້'} ມີໄຊ ${size}:`,
    sizeNo: (size, subject, a) => `ຂໍອະໄພ, ${subject || 'ສິນຄ້ານີ້'} ບໍ່ມີໄຊ ${size}.${a.length ? ` ມີ: ${a.join(', ')}.` : ''}`,
    priceIntro: 'ນີ້ແມ່ນລາຄາ:',
    inStock: (subject, n) => `ຍັງມີເດີ້! ${subject || 'ສິນຄ້ານີ້'} ເຫຼືອ ${n} ອັນ.`,
    soldOut: (subject) => `ຂໍອະໄພ, ${subject || 'ສິນຄ້ານີ້'} ໝົດແລ້ວ.`,
    cheaperYes: (subject) => `ນີ້ແມ່ນສິນຄ້າທີ່ຖືກກວ່າ${subject ? ` ${subject}` : ''}:`,
    cheaperNo: (subject) => `ຂໍອະໄພ, ຕອນນີ້ບໍ່ມີສິນຄ້າທີ່ຖືກກວ່າ${subject ? ` ${subject}` : ''}.`,
    related: (q) => `ບໍ່ພົບ “${q}” ແທ້ໆ, ແຕ່ມີສິນຄ້າທີ່ກ່ຽວຂ້ອງ:`,
    none: (q) => `ຂໍອະໄພ, ຍັງບໍ່ພົບ ${q ? `“${q}”` : 'ສິນຄ້ານີ້'}. ລອງໃຊ້ຄຳອື່ນ ຫຼື ສົ່ງຮູບມາ. 📷`,
    photoExact: (n, label) => `${label ? `ຄືວ່າແມ່ນ ${label}! ` : ''}ນີ້ແມ່ນ ${n} ສິນຄ້າທີ່ກົງກັບຮູບຂອງທ່ານ.`,
    photoRelated: (n, label) => `${label ? `ຄືວ່າແມ່ນ ${label}. ` : ''}ບໍ່ພົບທີ່ກົງແທ້, ແຕ່ມີ ${n} ສິນຄ້າທີ່ກ່ຽວຂ້ອງ.`,
    photoNone: 'ຍັງບໍ່ພົບສິນຄ້າທີ່ຄ້າຍກັບຮູບນີ້. ລອງຖ່າຍມຸມອື່ນ ຫຼື ບອກວ່າແມ່ນຫຍັງ.',
    orderCard: (name, n) => `ນີ້ແມ່ນຄຳສັ່ງຊື້ຂອງທ່ານ: ${name} × ${n} 👇 ກວດເບິ່ງຕົວເລືອກ, ທີ່ຢູ່ ແລະ ການຈ່າຍເງິນ ແລ້ວກົດ “ສັ່ງຊື້”.`,
    buyWhich: 'ຢາກໄດ້ອັນໃດ? ກົດ “ຊື້ເລີຍ” ໃຕ້ສິນຄ້າໄດ້ເລີຍ 👇',
    signInToOrder: 'ເຂົ້າສູ່ລະບົບເພື່ອສັ່ງຊື້ໃນແຊັດ — ຫຼື ກົດ “ຊື້ເລີຍ” ໃຕ້ສິນຄ້າ 👇',
    cannotOrder: 'ຂໍອະໄພ, ສິນຄ້ານີ້ສັ່ງຊື້ບໍ່ໄດ້ຕອນນີ້. ແຕະເພື່ອເບິ່ງລາຍລະອຽດ 👇',
  },
};

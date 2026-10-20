import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AnthropicService } from '../ai/anthropic.service.js';
import { ProductsService } from '../catalog/products/products.service.js';
import { ShopBotService, type BotTurn } from './bot/shop-bot.service.js';

export const CHATBOT_LIMITS = { faqs: 50, questionMax: 200, answerMax: 1000, previewMax: 1000 } as const;

/** Seller Center → Chat Bot: the shop's FAQ, what the bot knows, and a box to try it. */
@Injectable()
export class ChatbotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bot: ShopBotService,
    private readonly products: ProductsService,
    private readonly claude: AnthropicService,
  ) {}

  async overview(shopId: string) {
    const [shop, faqs, published] = await Promise.all([
      this.prisma.shop.findUniqueOrThrow({ where: { id: shopId }, select: { address: true, businessHours: true, paymentAccountNumber: true, paymentQrKey: true, description: true } }),
      this.faqs(shopId),
      this.prisma.product.count({ where: { shopId, status: 'PUBLISHED' } }),
    ]);
    const hours = (shop.businessHours ?? {}) as Record<string, unknown>;
    return {
      engine: this.claude.enabled ? ('ai' as const) : ('basic' as const),
      knows: {
        products: published,
        hours: Object.keys(hours).length > 0,
        address: !!shop.address,
        transfer: !!(shop.paymentAccountNumber || shop.paymentQrKey),
        description: !!shop.description,
      },
      faqs,
    };
  }

  faqs(shopId: string) {
    return this.prisma.shopFaq.findMany({
      where: { shopId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, question: true, answer: true, updatedAt: true },
    });
  }

  async create(shopId: string, dto: { question: string; answer: string }) {
    const data = clean(dto);
    if ((await this.prisma.shopFaq.count({ where: { shopId } })) >= CHATBOT_LIMITS.faqs) {
      throw new BadRequestException({ code: 'TOO_MANY_FAQS', message: `At most ${CHATBOT_LIMITS.faqs} questions` });
    }
    const last = await this.prisma.shopFaq.findFirst({ where: { shopId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    return this.prisma.shopFaq.create({ data: { shopId, ...data, sortOrder: (last?.sortOrder ?? 0) + 1 }, select: { id: true, question: true, answer: true, updatedAt: true } });
  }

  async update(shopId: string, id: string, dto: { question: string; answer: string }) {
    await this.own(shopId, id);
    return this.prisma.shopFaq.update({ where: { id }, data: clean(dto), select: { id: true, question: true, answer: true, updatedAt: true } });
  }

  async remove(shopId: string, id: string) {
    await this.own(shopId, id);
    await this.prisma.shopFaq.delete({ where: { id } });
  }

  /** What the bot would reply (nothing is sent or saved). */
  async preview(shopId: string, message: string, history: BotTurn[]) {
    if (!message.trim()) throw new BadRequestException({ code: 'EMPTY_MESSAGE', message: 'Type a message' });
    const answer = await this.bot.answer(shopId, { text: message, history: history.slice(-10), focusId: null });
    // An order card would go with the reply: show its product.
    const cards = await this.products.cardsByIds(answer.order ? [answer.order.productId] : answer.productIds);
    return {
      ...answer,
      order: !!answer.order,
      products: cards.map((c) => ({ id: c.id, name: c.name, slug: c.slug, shopSlug: c.shop.slug, price: c.price, imageUrl: c.imageUrl })),
    };
  }

  private async own(shopId: string, id: string) {
    const faq = await this.prisma.shopFaq.findFirst({ where: { id, shopId }, select: { id: true } });
    if (!faq) throw new NotFoundException({ code: 'FAQ_NOT_FOUND', message: 'Question not found' });
  }
}

function clean(dto: { question: string; answer: string }) {
  const question = dto.question.trim();
  const answer = dto.answer.trim();
  if (!question || !answer) throw new BadRequestException({ code: 'FAQ_REQUIRED', message: 'Write a question and its answer' });
  return { question, answer };
}

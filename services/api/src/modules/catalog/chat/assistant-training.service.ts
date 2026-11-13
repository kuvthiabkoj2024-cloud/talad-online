import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { ASSISTANT_TRAINING, type AssistantMissOutcome } from '@talad/shared';
import type { AdminUser, AssistantAnswer } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { faqScore, FAQ_MIN_SCORE } from '../../messages/bot/shop-bot-text.js';
import { normalizeLao, setTaughtWords, type ChatLocale } from './chat-text.js';

/** Why a question landed in the inbox. */
export type MissOutcome = AssistantMissOutcome;

/** Training is re-read this often too (another API instance may have changed it). */
const RELOAD_MS = 2 * 60_000;

/**
 * The inbox key: lowercased and trimmed, with long digit runs (phone and order numbers)
 * masked, so no personal number is kept and "TL123…" questions group together.
 */
export function missKey(text: string): string {
  return normalizeLao(text)
    .toLowerCase()
    .replace(/\d[\d\s-]{5,}\d/g, '•••')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ASSISTANT_TRAINING.questionMax);
}

/**
 * What admins teach Market Chat (Admin → Market Chat): official answers, words customers use,
 * and the inbox of questions it couldn't answer. Answers and words are kept in memory, so
 * matching a chat message costs nothing; they're re-read after each change.
 */
@Injectable()
export class AssistantTrainingService implements OnModuleInit {
  private readonly logger = new Logger(AssistantTrainingService.name);
  private answers: AssistantAnswer[] = [];
  private loadedAt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    await this.reload().catch((e: unknown) => this.logger.warn(`Market Chat training not loaded: ${e instanceof Error ? e.message : String(e)}`));
  }

  private async reload() {
    const [answers, words] = await Promise.all([
      this.prisma.assistantAnswer.findMany({ where: { isActive: true }, orderBy: { updatedAt: 'desc' } }),
      this.prisma.assistantWord.findMany({ select: { word: true, means: true } }),
    ]);
    this.answers = answers;
    setTaughtWords(words);
    this.loadedAt = Date.now();
  }

  private async fresh() {
    if (Date.now() - this.loadedAt > RELOAD_MS) await this.reload().catch(() => {});
  }

  /** The admin answer this message asks for, if one is close enough. */
  async match(message: string): Promise<{ answer: AssistantAnswer; score: number } | null> {
    await this.fresh();
    const text = message.trim();
    if (!text) return null;
    let best: { answer: AssistantAnswer; score: number } | null = null;
    for (const answer of this.answers) {
      for (const q of answer.questions) {
        const score = faqScore(text, q);
        if (score >= FAQ_MIN_SCORE && (!best || score > best.score)) best = { answer, score };
      }
    }
    return best;
  }

  /** Counts an answer given to a customer (not admin tests). */
  async hit(answerId: string) {
    await this.prisma.assistantAnswer.update({ where: { id: answerId }, data: { hits: { increment: 1 }, lastHitAt: new Date() } }).catch(() => {});
  }

  /** A question Market Chat couldn't answer well: counted in the inbox (reopened if it had been taught). */
  async recordMiss(text: string, lang: ChatLocale, outcome: MissOutcome) {
    const key = missKey(text);
    if (key.length < 2) return;
    await this.prisma.assistantMiss
      .upsert({
        where: { text: key },
        create: { text: key, lang, outcome },
        update: { count: { increment: 1 }, lastAt: new Date(), outcome, resolved: false },
      })
      .catch(() => {});
  }

  /** For Claude's instructions: the official answers and the taught words. */
  async forModel(lang: ChatLocale): Promise<string> {
    await this.fresh();
    const words = await this.prisma.assistantWord.findMany({ take: ASSISTANT_TRAINING.modelWords, orderBy: { updatedAt: 'desc' }, select: { word: true, means: true } });
    const answers = this.answers.slice(0, ASSISTANT_TRAINING.modelAnswers);
    return [
      answers.length
        ? `Official answers from the MC Mart team — when the customer asks one of these, give this answer (in their language), adding nothing that contradicts it:\n${answers
            .map((a) => `- Q: ${a.questions.slice(0, 3).join(' / ')}\n  A: ${lang === 'lo' ? a.answerLo : a.answerEn}`)
            .join('\n')}`
        : '',
      words.length ? `Words customers use (search for what they mean):\n${words.map((w) => `- "${w.word}" = ${w.means.join(', ')}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async overview() {
    const [answers, words, open, asked] = await Promise.all([
      this.prisma.assistantAnswer.count(),
      this.prisma.assistantWord.count(),
      this.prisma.assistantMiss.count({ where: { resolved: false } }),
      this.prisma.assistantAnswer.aggregate({ _sum: { hits: true } }),
    ]);
    return { answers, words, unanswered: open, answered: asked._sum.hits ?? 0 };
  }

  listAnswers() {
    return this.prisma.assistantAnswer.findMany({ orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }] });
  }

  async saveAnswer(admin: AdminUser, id: string | null, dto: { questions: string[]; answerLo: string; answerEn: string; productWords?: string | null; isActive?: boolean; fromMiss?: string | null }) {
    const questions = [...new Set(dto.questions.map((q) => q.trim()).filter(Boolean))];
    if (!questions.length) throw new BadRequestException({ code: 'QUESTION_REQUIRED', message: 'Add at least one question' });
    if (!dto.answerLo.trim() && !dto.answerEn.trim()) throw new BadRequestException({ code: 'ANSWER_REQUIRED', message: 'Write the answer' });
    // One language is enough to start: the other falls back to it.
    const data = {
      questions,
      answerLo: (dto.answerLo.trim() || dto.answerEn.trim()).slice(0, ASSISTANT_TRAINING.answerMax),
      answerEn: (dto.answerEn.trim() || dto.answerLo.trim()).slice(0, ASSISTANT_TRAINING.answerMax),
      productWords: dto.productWords?.trim() || null,
      isActive: dto.isActive ?? true,
    };
    if (id && !(await this.prisma.assistantAnswer.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Answer not found');
    const saved = id ? await this.prisma.assistantAnswer.update({ where: { id }, data }) : await this.prisma.assistantAnswer.create({ data: { ...data, createdById: admin.id } });
    if (dto.fromMiss) await this.prisma.assistantMiss.updateMany({ where: { id: dto.fromMiss }, data: { resolved: true } });
    await this.audit.log({ adminId: admin.id, action: id ? 'assistant.answer.update' : 'assistant.answer.create', entityType: 'AssistantAnswer', entityId: saved.id, changes: { questions, productWords: data.productWords, isActive: data.isActive } });
    await this.reload();
    return saved;
  }

  async deleteAnswer(admin: AdminUser, id: string) {
    const a = await this.prisma.assistantAnswer.delete({ where: { id } }).catch(() => null);
    if (!a) throw new NotFoundException('Answer not found');
    await this.audit.log({ adminId: admin.id, action: 'assistant.answer.delete', entityType: 'AssistantAnswer', entityId: id, changes: { questions: a.questions } });
    await this.reload();
    return { deleted: true };
  }

  listWords() {
    return this.prisma.assistantWord.findMany({ orderBy: { word: 'asc' } });
  }

  async saveWord(admin: AdminUser, id: string | null, dto: { word: string; means: string[]; fromMiss?: string | null }) {
    const word = normalizeLao(dto.word).trim().toLowerCase();
    const means = [...new Set(dto.means.map((m) => normalizeLao(m).trim()).filter((m) => m && m.toLowerCase() !== word))];
    if (!word) throw new BadRequestException({ code: 'WORD_REQUIRED', message: 'Type the word' });
    if (!means.length) throw new BadRequestException({ code: 'MEANS_REQUIRED', message: 'Add what it means' });
    const clash = await this.prisma.assistantWord.findUnique({ where: { word }, select: { id: true } });
    if (clash && clash.id !== id) throw new BadRequestException({ code: 'WORD_EXISTS', message: 'This word is already taught' });
    const saved = id ? await this.prisma.assistantWord.update({ where: { id }, data: { word, means } }) : await this.prisma.assistantWord.create({ data: { word, means, createdById: admin.id } });
    if (dto.fromMiss) await this.prisma.assistantMiss.updateMany({ where: { id: dto.fromMiss }, data: { resolved: true } });
    await this.audit.log({ adminId: admin.id, action: id ? 'assistant.word.update' : 'assistant.word.create', entityType: 'AssistantWord', entityId: saved.id, changes: { word, means } });
    await this.reload();
    return saved;
  }

  async deleteWord(admin: AdminUser, id: string) {
    const w = await this.prisma.assistantWord.delete({ where: { id } }).catch(() => null);
    if (!w) throw new NotFoundException('Word not found');
    await this.audit.log({ adminId: admin.id, action: 'assistant.word.delete', entityType: 'AssistantWord', entityId: id, changes: { word: w.word } });
    await this.reload();
    return { deleted: true };
  }

  /** The inbox: most asked first (`resolved` shows the taught/dismissed ones). */
  async misses(query: { resolved?: boolean; q?: string; page: number; pageSize: number }) {
    const where = { resolved: query.resolved ?? false, ...(query.q && { text: { contains: missKey(query.q) } }) };
    const [items, total] = await Promise.all([
      this.prisma.assistantMiss.findMany({ where, orderBy: [{ count: 'desc' }, { lastAt: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.assistantMiss.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Taught elsewhere, or not worth teaching: out of the inbox (until asked again). */
  async resolveMiss(admin: AdminUser, id: string, resolved: boolean) {
    const m = await this.prisma.assistantMiss.update({ where: { id }, data: { resolved } }).catch(() => null);
    if (!m) throw new NotFoundException('Question not found');
    await this.audit.log({ adminId: admin.id, action: resolved ? 'assistant.miss.dismiss' : 'assistant.miss.reopen', entityType: 'AssistantMiss', entityId: id, changes: { text: m.text } });
    return m;
  }
}

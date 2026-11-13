import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantTrainingService, missKey } from './assistant-training.service.js';
import { setTaughtWords, toConcepts } from './chat-text.js';

const ANSWER = {
  id: 'a1',
  questions: ['ມີຮ້ານຢູ່ປາກເຊບໍ', 'do you have a shop in pakse'],
  answerLo: 'ມີເດີ້! ຮ້ານກາເຟບໍລະເວນຢູ່ປາກເຊ.',
  answerEn: 'Yes! Bolaven Coffee is in Pakse.',
  productWords: null,
  isActive: true,
  hits: 0,
  lastHitAt: null,
  createdById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function service(answers = [ANSWER], words: { word: string; means: string[] }[] = []) {
  const prisma = {
    assistantAnswer: { findMany: vi.fn().mockResolvedValue(answers), update: vi.fn().mockResolvedValue({}) },
    assistantWord: { findMany: vi.fn().mockResolvedValue(words) },
    assistantMiss: { upsert: vi.fn().mockResolvedValue({}) },
  };
  return { prisma, training: new AssistantTrainingService(prisma as never, { log: vi.fn() } as never) };
}

afterEach(() => setTaughtWords([]));

describe('Market Chat training', () => {
  it('answers with the team’s answer for a close phrasing, in Lao or English', async () => {
    const { training } = service();
    await training.onModuleInit();
    expect((await training.match('ມີຮ້ານຢູ່ປາກເຊບໍ່?'))?.answer.id).toBe('a1');
    expect((await training.match('Do you have a shop in Pakse?'))?.answer.id).toBe('a1');
    expect(await training.match('ມີກາເຟບໍ?')).toBeNull();
  });

  it('teaches words: a Lao or English word searches for what it means', async () => {
    const { training } = service([], [
      { word: 'ໂສ້ງ', means: ['pants', 'trousers'] },
      { word: 'airpods', means: ['earbuds', 'ຫູຟັງ'] },
    ]);
    await training.onModuleInit();
    expect(toConcepts(['ໂສ້ງ'])).toEqual([{ alternatives: ['ໂສ້ງ', 'pants', 'trousers'], known: true }]);
    expect(toConcepts(['airpods'])[0]).toEqual({ alternatives: ['airpods', 'earbuds', 'ຫູຟັງ'], known: true });
  });

  it('keeps no phone or order number in the inbox, and groups the same question', () => {
    expect(missKey('ໂທຫາຂ້ອຍ 020 5555 1234 ແດ່')).toBe('ໂທຫາຂ້ອຍ ••• ແດ່');
    expect(missKey('Where is TL2610285173238?')).toBe('where is tl•••?');
    expect(missKey('  Durian   PASTE ')).toBe(missKey('durian paste'));
  });

  it('counts unanswered questions without the customer', async () => {
    const { training, prisma } = service();
    await training.recordMiss('Durian paste?', 'en', 'not_found');
    const call = prisma.assistantMiss.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ text: 'durian paste?' });
    expect(call.create).toEqual({ text: 'durian paste?', lang: 'en', outcome: 'not_found' });
    // Asked again after an admin dismissed it: back in the inbox.
    expect(call.update).toMatchObject({ resolved: false });
  });
});

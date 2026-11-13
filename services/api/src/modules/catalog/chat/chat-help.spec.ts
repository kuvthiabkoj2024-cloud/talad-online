import { describe, expect, it } from 'vitest';
import { detectHelp, helpAnswer, type HelpFacts, type HelpTopic } from './chat-help.js';
import { detectIntent } from './chat-intents.js';
import { extractQuery, isThanks } from './chat-text.js';

/** Customers' own wording (Lao as phones type it, and English) for each question about MC Mart. */
const ASKED: Record<HelpTopic, string[]> = {
  orders: ['ຄຳສັ່ງຊື້ຂ້ອຍຮອດໃສແລ້ວ?', 'ຢາກຕິດຕາມພັດສະດຸ', 'ເປັນຫຍັງຍັງບໍ່ຮອດ?', 'where is my order?', "I haven't received it"],
  cancel: ['ຂ້ອຍຢາກຍົກເລີກຄຳສັ່ງຊື້', 'how do i cancel my order?'],
  paymentCheck: ['ຈ່າຍເງິນແລ້ວ ແຕ່ຍັງບໍ່ຢືນຢັນ', 'ໂອນແລ້ວເດີ້', 'I already paid but nothing happened'],
  returns: ['ປ່ຽນຄືນໄດ້ບໍ?', 'ຢາກໄດ້ເງິນຄືນ', 'can I return it if it is broken?', 'refund please'],
  deliveryFee: ['ຄ່າສົ່ງເທົ່າໃດ?', 'ຄ່າສົ່ງໄປປາກເຊເທົ່າໃດ?', 'how much is shipping?', 'free delivery?'],
  deliveryTime: ['ຈັກມື້ຈຶ່ງຮອດ?', 'ສົ່ງປາກເຊຈັກມື້?', 'ສົ່ງດ່ວນໄດ້ບໍ?', 'how long does delivery take?'],
  howToBuy: ['ສັ່ງຊື້ແນວໃດ?', 'how do I order?'],
  sell: ['ຢາກເປີດຮ້ານຂາຍ ເຮັດແນວໃດ?', 'how can I sell on MC Mart?'],
  contact: ['ຂໍເບີໂທແອດມິນແດ່', 'I want to talk to a person'],
  points: ['ຄະແນນສະສົມໃຊ້ແນວໃດ?', 'how do loyalty points work?'],
  account: ['ລືມລະຫັດຜ່ານ', 'how do I change my address?'],
  hours: ['ເປີດຈັກໂມງ?', 'are you open?'],
  authentic: ['ຂອງແທ້ບໍ?', 'is it original?'],
  about: ['ເຈົ້າແມ່ນໃຜ?', 'what can you do?', 'help'],
  bye: ['ບາຍ', 'bye!'],
  ack: ['ໂອເຄ', 'ok', 'ໄດ້ເລີຍ', '👍'],
};

const FACTS: HelpFacts = { payments: ['bank transfer (QR)', 'cash on delivery'], points: { redeemValue: 100, expiryDays: 365 }, orders: null };

describe('Market Chat: questions about MC Mart', () => {
  for (const [topic, messages] of Object.entries(ASKED)) {
    it(`understands "${topic}"`, () => {
      for (const m of messages) expect([m, detectHelp(m)]).toEqual([m, topic]);
    });
  }

  it('leaves product questions to the product search', () => {
    for (const m of ['do you sell coffee?', 'ຢາກຕິດຕາມຮ້ານນີ້', 'help me find coffee', 'ມີກາເຟບໍ?', 'wireless earbuds', 'ຂອງຂວັນໃຫ້ແມ່', 'phone case', 'ໂທລະສັບ']) {
      expect([m, detectHelp(m)]).toEqual([m, null]);
    }
  });

  it('answers in the language of the conversation, from the live facts', () => {
    expect(helpAnswer('points', 'en', FACTS)).toContain('1 point = ₭100');
    expect(helpAnswer('howToBuy', 'lo', { ...FACTS, payments: ['ໂອນຜ່ານ QR'] })).toContain('ໂອນຜ່ານ QR');
    expect(helpAnswer('contact', 'lo', FACTS)).toContain('020 7780 2519');
    // A guest is sent to tracking; a signed-in customer gets their orders.
    expect(helpAnswer('orders', 'en', FACTS)).toContain('Track order');
    const mine = helpAnswer('orders', 'en', { ...FACTS, orders: [{ number: 'TL1', status: 'SHIPPED', carrier: 'HAL', tracking: 'X9' }] });
    expect(mine).toContain('TL1 — on its way · HAL (X9)');
  });
});

describe('Market Chat: product follow-ups', () => {
  it('understands comparing, cheapest, bulk, warranty, gifts and new arrivals', () => {
    expect(detectIntent('ອັນໃດດີກວ່າ?')).toEqual({ kind: 'compare' });
    expect(detectIntent('which one is better?')).toEqual({ kind: 'compare' });
    expect(detectIntent('ກາເຟອັນໃດຖືກສຸດ?')).toEqual({ kind: 'cheapest' });
    expect(detectIntent('cheapest t-shirt')).toEqual({ kind: 'cheapest' });
    // "ລາຄາສົ່ງ" is a wholesale price, not delivery.
    expect(detectIntent('ຊື້ຫຼາຍມີລາຄາສົ່ງບໍ?')).toEqual({ kind: 'bulk' });
    expect(detectIntent('do you have wholesale prices?')).toEqual({ kind: 'bulk' });
    expect(detectIntent('ມີປະກັນບໍ?')).toEqual({ kind: 'warranty' });
    expect(detectIntent('ຂອງຂວັນໃຫ້ແມ່')).toEqual({ kind: 'gift' });
    expect(detectIntent('ມີຫຍັງໃໝ່ແດ່?')).toEqual({ kind: 'new' });
    expect(detectIntent('ມີຮ້ານຢູ່ຫຼວງພະບາງບໍ?')).toEqual({ kind: 'shops' });
  });

  it('reads a budget, and never searches for the currency', () => {
    expect(extractQuery('ງົບ 100 ພັນ ມີຫຍັງແດ່?')).toEqual({ keywords: [], maxPrice: 100_000 });
    expect(extractQuery('something under 50,000 kip')).toEqual({ keywords: [], maxPrice: 50_000 });
    expect(extractQuery('earbuds under 300k')).toEqual({ keywords: ['earbuds'], maxPrice: 300_000 });
    expect(extractQuery('ກາເຟ ບໍ່ເກີນ 2 ແສນກີບ')).toEqual({ keywords: ['ກາເຟ'], maxPrice: 200_000 });
  });

  it('drops a greeting before searching, and knows more ways of saying thanks', () => {
    expect(extractQuery('ສະບາຍດີ ມີກາເຟບໍ?').keywords).toEqual(['ກາເຟ']);
    for (const m of ['ຂອບໃຈຫຼາຍໆ', 'thank you so much!', 'ok thanks', 'ຂອບໃຈເດີ້']) expect([m, isThanks(m)]).toEqual([m, true]);
  });
});

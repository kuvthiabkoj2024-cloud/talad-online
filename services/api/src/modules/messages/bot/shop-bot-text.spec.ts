import { analyse, describeHours, faqScore, INFO_TOPICS, matchFaq } from './shop-bot-text.js';

const kind = (text: string, faqs?: string[]) => analyse(text, faqs).kind;

describe('Shop chat bot: what is the customer asking?', () => {
  it('answers information questions without products', () => {
    for (const [text, expected] of [
      ['ສະບາຍດີ', 'greeting'],
      ['Thanks!', 'thanks'],
      ['ຮ້ານເປີດຈັກໂມງ?', 'hours'],
      ['What time do you open?', 'hours'],
      ['ຮ້ານຢູ່ໃສ?', 'location'],
      ['Where is your shop?', 'location'],
      ['ຈ່າຍປາຍທາງໄດ້ບໍ?', 'payment'],
      ['Do you deliver to Pakse?', 'delivery'],
      ['ມີສ່ວນຫຼຸດບໍ?', 'discount'],
      ['Where is my order TL2610056607852?', 'order'],
      ['I want to return this', 'order'],
      ['ຍັງບໍ່ໄດ້ຮັບເຄື່ອງ', 'order'],
    ] as const) {
      expect([text, kind(text)]).toEqual([text, expected]);
      expect(INFO_TOPICS.has(expected)).toBe(true);
    }
  });

  it('recognises product questions', () => {
    expect(analyse('ມີເສື້ອຍືດບໍ?')).toMatchObject({ kind: 'search', keywords: ['ເສື້ອຍືດ'] });
    expect(analyse('Do you have coffee under 100k?')).toMatchObject({ kind: 'search', keywords: ['coffee'], maxPrice: 100000 });
    expect(analyse('ມີໄຊ XL ບໍ?')).toEqual({ kind: 'size', size: 'XL' });
    expect(kind('Do you have this in blue?')).toBe('color');
    expect(kind('ລາຄາເທົ່າໃດ')).toBe('price');
    expect(kind('Is it still available?')).toBe('stock');
    expect(kind('anything cheaper?')).toBe('cheaper');
    expect(INFO_TOPICS.has('search')).toBe(false);
  });

  it("uses the seller's FAQ first when the question is close", () => {
    const faqs = ['ສົ່ງຄືນສິນຄ້າໄດ້ບໍ່?', 'Do you accept returns?', 'ເຮັດວຽກວັນອາທິດບໍ?'];
    expect(analyse('ສາມາດສົ່ງຄືນສິນຄ້າໄດ້ບໍ?', faqs)).toEqual({ kind: 'faq', index: 0 });
    expect(analyse('do you accept returns', faqs)).toEqual({ kind: 'faq', index: 1 });
    expect(analyse('ວັນອາທິດເຮັດວຽກບໍ', faqs)).toEqual({ kind: 'faq', index: 2 });
    // Unrelated questions don't borrow an FAQ answer.
    expect(matchFaq('ມີກາເຟບໍ?', faqs)).toBeNull();
    expect(matchFaq('do you have coffee', faqs)).toBeNull();
    expect(faqScore('', 'anything')).toBe(0);
  });

  it('describes opening hours, grouping days', () => {
    const hours = { mon: { open: '08:00', close: '18:00' }, tue: { open: '08:00', close: '18:00' }, wed: { open: '08:00', close: '18:00' }, sat: { open: '09:00', close: '12:00' } };
    expect(describeHours(hours, 'en')).toBe('Mon–Wed 08:00–18:00, Sat 09:00–12:00 (closed Thu, Fri, Sun)');
    expect(describeHours(hours, 'lo')).toBe('ຈັນ–ພຸດ 08:00–18:00, ເສົາ 09:00–12:00 (ປິດ ພະຫັດ, ສຸກ, ອາທິດ)');
    expect(describeHours({}, 'en')).toBeNull();
  });
});

describe('Shop chat bot: stays quiet when nothing is asked', () => {
  it('lets the seller answer "ok", news and plans', () => {
    for (const text of [
      'ສັ່ງແລ້ວເດີ', // I've ordered
      'ດຽວໄປເບິ່ງ ແລະ ລອງເຄື່ອງກ່ອນເດີ', // I'll go and try it first
      'ໂອນເງິນແລ້ວ',
      'ໂອເຄ',
      'ok 👍',
      '🙏😊',
      'ບໍ່ເປັນຫຍັງ',
      "I've paid already",
    ]) expect([text, kind(text)]).toEqual([text, 'silent']);
  });

  it('answers thanks with a warm reply', () => {
    for (const text of [
      'ຂອບໃຈເຈົ້າ',
      'ເຈົ້າ, ຂອບໃຈເດີ',
      'ຂອບໃຈ ຫວ່າງຈະເຂົ້າໄປເບິ່ງເຄື່ອງເດີ', // thanks, I'll come and look when I'm free (not "rice")
      'Thank you so much!',
    ]) expect([text, kind(text)]).toEqual([text, 'thanks']);
  });

  it('still answers questions and requests, even with thanks or news in them', () => {
    expect(kind('ສົ່ງແຜນທີ່ຮ້ານໃຫ້ແດ່?')).toBe('location');
    expect(kind('ຂອບໃຈ ຮ້ານຢູ່ໃສ?')).toBe('location');
    expect(kind('ຂອບໃຈ ເອົາ 1 ອັນ')).toBe('buy');
    expect(kind('ເອົາ 2 ອັນເດີ')).toBe('buy');
    expect(kind('ສັ່ງແລ້ວ ຈະໄດ້ຮັບມື້ໃດ?')).toBe('order');
    expect(kind('ບໍ່ມີແບບນີ້ບໍ່')).not.toBe('silent');
    expect(kind('ລາຄາເທົ່າໃດ')).toBe('price');
    expect(kind('ມີແທ້ຫວ່າ')).not.toBe('silent');
    expect(kind('ສະບາຍດີ')).toBe('greeting');
  });
});

describe('Shop chat bot: Claude replies', () => {
  it('takes the products Claude chose and drops its control lines', async () => {
    const { parseAiReply } = await import('./shop-bot.service.js');
    const results = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(parseAiReply('Yes! We have two.\nSHOW: 3, 1, 9', results, 'fallback')).toMatchObject({ text: 'Yes! We have two.', productIds: ['c', 'a'], handoff: false });
    expect(parseAiReply('We open at 8.', results, 'fallback')).toMatchObject({ text: 'We open at 8.', productIds: [] });
    expect(parseAiReply('The shop will reply soon.\nHANDOFF', results, 'fallback')).toMatchObject({ text: 'The shop will reply soon.', handoff: true });
    expect(parseAiReply('', results, 'fallback').text).toBe('fallback');
    expect(parseAiReply('SILENT', results, 'fallback')).toMatchObject({ silent: true, text: '', productIds: [] });
  });
});

describe('Shop chat bot: buying', () => {
  it('recognises "I want to buy" and how many', () => {
    expect(analyse("I'll take 2")).toEqual({ kind: 'buy', quantity: 2 });
    expect(analyse('ເອົາ 2 ຜືນ ໄຊ L')).toEqual({ kind: 'buy', quantity: 2 });
    expect(analyse('ຂໍສັ່ງສາມອັນ')).toEqual({ kind: 'buy', quantity: 3 });
    expect(analyse('I want to buy this')).toEqual({ kind: 'buy', quantity: 1 });
    expect(analyse('buy x3')).toEqual({ kind: 'buy', quantity: 3 });
    expect(analyse('ຢາກຊື້ກາເຟ')).toEqual({ kind: 'buy', quantity: 1 });
    // Existing orders are still for the seller.
    expect(kind('Where is my order?')).toBe('order');
    expect(kind('ມີເສື້ອຍືດບໍ?')).toBe('search');
  });

  it('leaves the product words', async () => {
    const { stripBuyWords } = await import('./shop-bot-text.js');
    expect(stripBuyWords('ຢາກຊື້ກາເຟ 2 ຖົງ').trim()).toBe('ຢາກ ກາເຟ');
    expect(stripBuyWords("I'll take the t-shirt x2").replace(/\s+/g, ' ').trim()).toBe('the t-shirt');
  });
});

describe('Shop chat bot: "this one"', () => {
  it('has no product words in "ເອົາອັນນີ້" / "I\'ll take this one"', async () => {
    const { extractQuery } = await import('../../catalog/chat/chat-text.js');
    const { stripBuyWords } = await import('./shop-bot-text.js');
    expect(extractQuery(stripBuyWords('ເອົາອັນນີ້')).keywords).toEqual([]);
    expect(extractQuery(stripBuyWords("I'll take this one")).keywords).toEqual([]);
  });
});

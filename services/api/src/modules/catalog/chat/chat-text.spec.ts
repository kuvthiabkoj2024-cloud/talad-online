import { extractQuery, hasColor, isGreeting, isThanks, normalizeLao, relatedWords, takeColor, toConcepts } from './chat-text.js';

describe('Market Chat text', () => {
  it('pulls English search words and a price ceiling', () => {
    expect(extractQuery('Hi, I want wireless earbuds under 300k please')).toEqual({ keywords: ['wireless', 'earbuds'], maxPrice: 300_000 });
    expect(extractQuery('Do you have coffee beans?')).toEqual({ keywords: ['coffee', 'beans'], maxPrice: null });
  });

  it('cuts Lao filler words out of unspaced Lao text', () => {
    expect(extractQuery('ຢາກໄດ້ກາເຟ')).toEqual({ keywords: ['ກາເຟ'], maxPrice: null });
    expect(extractQuery('ມີເສື້ອຜ້າບໍ່')).toEqual({ keywords: ['ເສື້ອຜ້າ'], maxPrice: null });
    expect(extractQuery('ຊອກຫາຫູຟັງ ລາຄາບໍ່ເກີນ 200,000 ກີບ')).toEqual({ keywords: ['ຫູຟັງ'], maxPrice: 200_000 });
    // Fillers inside real words stay: ມີດ (knife) is not "ມີ" + "ດ".
    expect(extractQuery('ຢາກໄດ້ມີດ')).toEqual({ keywords: ['ມີດ'], maxPrice: null });
  });

  it('recognises greetings and thanks in both languages', () => {
    expect(isGreeting('Hello!')).toBe(true);
    expect(isGreeting('ສະບາຍດີ')).toBe(true);
    expect(isGreeting('hello I need rice')).toBe(false);
    expect(isThanks('ຂອບໃຈຫຼາຍເດີ້')).toBe(true);
    expect(isThanks('thank you')).toBe(true);
  });

  it('splits a question into concepts with Lao/English alternatives', () => {
    expect(toConcepts(['ກາເຟ'])).toEqual([{ alternatives: ['ກາເຟ', 'coffee'], known: true }]);
    // A Lao compound is two concepts; synonyms stay one.
    expect(toConcepts(['ອາຫານແມວ']).map((c) => c.alternatives[0]).sort()).toEqual(['ອາຫານ', 'ແມວ'].sort());
    expect(toConcepts(['ຫູຟັງ'])).toEqual([{ alternatives: ['ຫູຟັງ', 'earbuds', 'headphones'], known: true }]);
    // Whole words only, and unknown describing words are marked as such.
    expect(toConcepts(['headphones', 'lao'])).toEqual([
      { alternatives: ['headphones', 'ຫູຟັງ'], known: true },
      { alternatives: ['lao'], known: false },
    ]);
  });

  it('finds the colour asked for and checks products for it', () => {
    const lao = takeColor('ມີສີບົວບໍ?');
    expect(lao.color?.en).toBe('pink');
    expect(extractQuery(lao.rest).keywords).toEqual([]);
    expect(takeColor('Do you have it in pink?').color?.en).toBe('pink');
    expect(takeColor('ຢາກໄດ້ເສື້ອຍືດ').color).toBeNull();
    const pink = takeColor('pink').color!;
    expect(hasColor(pink, ['Everyday cotton T-shirt, unisex', 'S', 'M', 'L'])).toBe(false);
    expect(hasColor(pink, ['Silk scarf', 'Pink', 'Blue'])).toBe(true);
    expect(hasColor(pink, ['ຜ້າພັນຄໍ', 'ບົວ'])).toBe(true);
  });

  it('reads unspaced Lao by whole words', () => {
    // "ໝາກມ່ວງ" is mango, not "ໝາ" (dog) inside it.
    expect(toConcepts(['ໝາກມ່ວງ'])).toEqual([{ alternatives: ['ໝາກມ່ວງ', 'mango'], known: true }]);
    // Glossary words are found inside a phrase; what's left stays as one phrase, with its words for related results.
    const cream = toConcepts(extractQuery('ຄີມທາຜິວແດ?').keywords);
    expect(cream.filter((c) => c.known).map((c) => c.alternatives[1])).toEqual(['cream', 'skin']);
    expect(relatedWords(toConcepts(extractQuery('ຢາສະມຸນໄພ').keywords))).toEqual(expect.arrayContaining(['ຢາ', 'ໄພ']));
    // ຫມ and ໝ are the same letter.
    expect(normalizeLao('ຢາສະຫມູນໄພ')).toBe('ຢາສະໝູນໄພ');
    expect(toConcepts(['ຢາສະຫມູນໄພ'])[0]).toMatchObject({ alternatives: ['ຢາສະໝູນໄພ', 'herbal medicine'], known: true });
  });
});

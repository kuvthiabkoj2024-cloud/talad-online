import { parseDescription } from './vision-keywords.service.js';

const cats = [{ slug: 'food' }, { slug: 'electronics' }];

describe('parseDescription', () => {
  it('reads keywords in both languages and a known category', () => {
    const d = parseDescription(
      'Here you go: {"label": "Roasted coffee beans", "keywords_en": ["coffee beans", "coffee", "c"], "keywords_lo": ["ເມັດກາເຟ", "coffee"], "category": "food"}',
      cats,
    );
    expect(d).toEqual({ label: 'Roasted coffee beans', keywords: ['coffee beans', 'coffee', 'ເມັດກາເຟ'], category: 'food' });
  });

  it('drops categories that are not in the catalog and handles "no product"', () => {
    expect(parseDescription('{"label": null, "keywords_en": [], "keywords_lo": [], "category": "cars"}', cats)).toEqual({
      label: null,
      keywords: [],
      category: null,
    });
  });

  it('throws on a reply without JSON (the caller falls back to visual matches)', () => {
    expect(() => parseDescription('Sorry, I cannot help with that.', cats)).toThrow();
  });
});

import { detectIntent, findProvince, normalizeSize, stripIntentWords } from './chat-intents.js';
import { extractQuery, normalizeLao } from './chat-text.js';

describe('Market Chat intents', () => {
  it('recognises payment, delivery and promotion questions in Lao and English', () => {
    expect(detectIntent('ຈ່າຍປາຍທາງໄດ້ບໍ?')).toEqual({ kind: 'payment' });
    expect(detectIntent('Can I pay COD?')).toEqual({ kind: 'payment' });
    expect(detectIntent('ສົ່ງຮອດຫຼວງພະບາງບໍ?')).toEqual({ kind: 'delivery', province: 'LP' });
    expect(detectIntent('Do you deliver to Pakse?')).toEqual({ kind: 'delivery', province: 'CH' });
    expect(detectIntent('ມີສ່ວນຫຼຸດບໍ?')).toEqual({ kind: 'discount' });
    expect(detectIntent('any sale today?')).toEqual({ kind: 'discount' });
  });

  it('recognises size, price, stock and "cheaper" follow-ups', () => {
    expect(detectIntent('ມີໄຊ XL ບໍ?')).toEqual({ kind: 'size', size: 'XL' });
    expect(detectIntent('size m?')).toEqual({ kind: 'size', size: 'M' });
    expect(detectIntent('coffee 1kg')).toEqual({ kind: 'size', size: '1 kg' });
    expect(detectIntent('ກາເຟລາຄາເທົ່າໃດ?')).toEqual({ kind: 'price' });
    expect(detectIntent('how much is it?')).toEqual({ kind: 'price' });
    expect(detectIntent('ຍັງມີຂອງບໍ?')).toEqual({ kind: 'stock' });
    expect(detectIntent('ມີຖືກກວ່ານີ້ບໍ?')).toEqual({ kind: 'cheaper' });
  });

  it('understands "recommended shop" as a question about shops, not a product', () => {
    // Both ways phones type ຳ: "ແນະນໍາ" (ໍ + າ) and "ແນະນຳ".
    expect(detectIntent('ມີຮ້ານຄ້າແນະນໍາບໍ?')).toEqual({ kind: 'shops' });
    expect(detectIntent('ມີຮ້ານແນະນຳບໍ?')).toEqual({ kind: 'shops' });
    expect(detectIntent('ຮ້ານໃດຂາຍກາເຟດີ?')).toEqual({ kind: 'shops' });
    expect(detectIntent('Any recommended shops?')).toEqual({ kind: 'shops' });
    expect(detectIntent('which store is good for coffee')).toEqual({ kind: 'shops' });
    // What's left names the product, if any.
    expect(extractQuery(stripIntentWords('ຮ້ານໃດຂາຍກາເຟດີ?')).keywords).toEqual(['ກາເຟ']);
    expect(extractQuery(stripIntentWords('ມີຮ້ານຄ້າແນະນໍາບໍ?')).keywords).toEqual([]);
  });

  it('understands "other ones" as more of the same, not a product called "other"', () => {
    expect(detectIntent('ມີແບບອື່ນບໍ?')).toEqual({ kind: 'more' });
    expect(detectIntent('ມີອັນອື່ນບໍ')).toEqual({ kind: 'more' });
    expect(detectIntent('Any other ones?')).toEqual({ kind: 'more' });
    expect(detectIntent('do you have different models')).toEqual({ kind: 'more' });
    expect(extractQuery(stripIntentWords('ມີແບບອື່ນບໍ?')).keywords).toEqual([]);
  });

  it('understands asking for a recommendation', () => {
    expect(detectIntent('ແນະນໍາແດ່')).toEqual({ kind: 'recommend' });
    expect(detectIntent('what do you recommend?')).toEqual({ kind: 'recommend' });
  });

  it('spells Lao one way', () => {
    expect(normalizeLao('ແນະນໍາ')).toBe('ແນະນຳ');
    expect(normalizeLao('ນໍ້າ')).toBe('ນ້ຳ');
    expect(normalizeLao('ຫມາກ')).toBe('ໝາກ');
  });

  it('leaves plain product questions alone', () => {
    expect(detectIntent('ຢາກໄດ້ກາເຟ')).toBeNull();
    expect(detectIntent('Do you have Lao coffee?')).toBeNull();
    expect(detectIntent('ຫູຟັງໄຮ້ສາຍ ບໍ່ເກີນ 300 ພັນ')).toBeNull();
  });

  it('normalises sizes and finds provinces by city name', () => {
    expect(normalizeSize('1KG')).toBe('1 kg');
    expect(normalizeSize('xl')).toBe('XL');
    expect(findProvince('ສົ່ງໄປປາກເຊ')).toBe('CH');
    expect(findProvince('nowhere')).toBeNull();
  });
});

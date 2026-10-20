import { detectIntent, findProvince, normalizeSize } from './chat-intents.js';

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

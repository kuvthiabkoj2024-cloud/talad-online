import { LAO_PROVINCES, PROVINCE_CODES, type ProvinceCode } from '@talad/shared';

/**
 * What a chat message asks about, beyond "find me X" (Market Chat's built-in assistant).
 * Lao and English phrasings; checked in this order.
 */
export type Intent =
  | { kind: 'payment' }
  | { kind: 'delivery'; province: ProvinceCode | null }
  | { kind: 'discount' }
  | { kind: 'size'; size: string }
  | { kind: 'price' }
  | { kind: 'stock' }
  | { kind: 'cheaper' };

const PAYMENT = /\b(cod|cash on delivery|pay(ment)?|bank transfer|qr)\b|ຈ່າຍ|ຊຳລະ|ປາຍທາງ|ໂອນເງິນ|ໂອນ/i;
const DELIVERY = /\b(deliver(y|s|ed)?|ship(ping|s)?|send to|courier)\b|ຈັດສົ່ງ|ຂົນສົ່ງ|ສົ່ງຮອດ|ສົ່ງໄປ|ສົ່ງ.*ໄດ້ບໍ|ສົ່ງບໍ/i;
const DISCOUNT = /\b(discount|sale|promo(tion)?s?|coupon|deal)s?\b|ສ່ວນຫຼຸດ|ຫຼຸດລາຄາ|ໂປຣ|ໂປໂມຊັນ|ຄູປອງ/i;
const PRICE = /\b(how much|what('s| is) the price|price of|cost)\b|ເທົ່າໃດ|ເທົ່າໃດ|ລາຄາເທົ່າ/i;
const STOCK = /\b(in stock|still (have|available)|available|sold out|out of stock)\b|ຍັງມີ|ໝົດແລ້ວ|ໝົດບໍ|ເຫຼືອບໍ|ມີຂອງບໍ/i;
const CHEAPER = /\b(cheaper|less expensive|lower price)\b|ຖືກກວ່າ|ລາຄາຖືກກວ່າ|ຖືກໆ/i;
/** "size L", "ໄຊ XL", "ຂະໜາດ M", "1 kg", "500 g". */
const SIZE = /(?:\bsize\b|ໄຊ|ຂະໜາດ)\s*(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|\d+(?:[.,]\d+)?\s?(?:kg|g|ml|l|cm|mm)?)\b|\b(\d+(?:[.,]\d+)?\s?(?:kg|g|ml|cm))\b|\b(xxs|xs|xl|xxl|xxxl|2xl|3xl)\b/i;

/** Common city names that point to a province ("Pakse" → Champasak). */
const PLACE_ALIASES: Record<string, ProvinceCode> = {
  pakse: 'CH', ປາກເຊ: 'CH', vientiane: 'VT', ວຽງຈັນ: 'VT', thakhek: 'KH', ທ່າແຂກ: 'KH', phonsavan: 'XI', ໂພນສະຫວັນ: 'XI',
  'luang prabang': 'LP', 'luang namtha': 'LM', savannakhet: 'SV', 'vang vieng': 'VI', ວັງວຽງ: 'VI',
};

export function findProvince(text: string): ProvinceCode | null {
  const low = text.toLowerCase();
  for (const code of PROVINCE_CODES) {
    const { lo, en } = LAO_PROVINCES[code];
    if (low.includes(lo) || low.includes(en.toLowerCase())) return code;
  }
  for (const [alias, code] of Object.entries(PLACE_ALIASES)) if (low.includes(alias)) return code;
  return null;
}

export function detectIntent(text: string): Intent | null {
  if (PAYMENT.test(text)) return { kind: 'payment' };
  if (DELIVERY.test(text)) return { kind: 'delivery', province: findProvince(text) };
  if (DISCOUNT.test(text)) return { kind: 'discount' };
  const size = SIZE.exec(text);
  if (size) return { kind: 'size', size: normalizeSize(size[1] ?? size[2] ?? size[3]) };
  if (PRICE.test(text)) return { kind: 'price' };
  if (CHEAPER.test(text)) return { kind: 'cheaper' };
  if (STOCK.test(text)) return { kind: 'stock' };
  return null;
}

/** "xl" → "XL", "1kg" / "1 KG" → "1 kg". */
export function normalizeSize(raw: string): string {
  const s = raw.trim().replace(',', '.');
  const unit = /^(\d+(?:\.\d+)?)\s?([a-z]+)$/i.exec(s);
  return unit ? `${unit[1]} ${unit[2].toLowerCase()}` : s.toUpperCase();
}

/** Text with the intent's own words removed, so what's left names the product ("ກາເຟລາຄາເທົ່າໃດ" → "ກາເຟ"). */
export function stripIntentWords(text: string): string {
  return text
    .replace(new RegExp(SIZE.source, 'gi'), ' ')
    .replace(new RegExp(PRICE.source, 'gi'), ' ')
    .replace(new RegExp(STOCK.source, 'gi'), ' ')
    .replace(new RegExp(CHEAPER.source, 'gi'), ' ');
}

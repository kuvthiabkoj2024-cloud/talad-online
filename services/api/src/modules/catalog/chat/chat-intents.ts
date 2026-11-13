import { LAO_PROVINCES, PROVINCE_CODES, type ProvinceCode } from '@talad/shared';
import { normalizeLao } from './chat-text.js';

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
  | { kind: 'cheaper' }
  /** "Any recommended shop?" / "ຮ້ານໃດດີ?": the best-rated shops (for a product, when one is named). */
  | { kind: 'shops' }
  /** "Any other ones?" / "ມີແບບອື່ນບໍ?": more of what was asked about, not a product called "other". */
  | { kind: 'more' }
  /** "What do you recommend?" / "ແນະນຳແດ່": best sellers (of a product, when one is named). */
  | { kind: 'recommend' }
  /** "Which one is better?" / "ອັນໃດດີກວ່າ": the best of what's discussed, with ratings and sales side by side. */
  | { kind: 'compare' }
  /** "Cheapest coffee?" / "ອັນໃດຖືກສຸດ": what's discussed, lowest price first. */
  | { kind: 'cheapest' }
  /** "Wholesale price?" / "ຊື້ຫຼາຍມີລາຄາສົ່ງບໍ": products with bulk (tier) prices. */
  | { kind: 'bulk' }
  /** "Any warranty?" / "ມີປະກັນບໍ": products that come with a guarantee. */
  | { kind: 'warranty' }
  /** "What's new?" / "ມີຫຍັງໃໝ່": the newest products. */
  | { kind: 'new' }
  /** "A gift for mom" / "ຂອງຂວັນ": gift ideas (popular gift-type products). */
  | { kind: 'gift' };

const PAYMENT = /\b(cod|cash on delivery|pay(ment)?|bank transfer|qr)\b|ຈ່າຍ|ຊຳລະ|ປາຍທາງ|ໂອນເງິນ|ໂອນ/i;
const DELIVERY = /\b(deliver(y|s|ed)?|ship(ping|s)?|send to|courier)\b|ຈັດສົ່ງ|ຂົນສົ່ງ|ສົ່ງຮອດ|ສົ່ງໄປ|ສົ່ງ.*ໄດ້ບໍ|ສົ່ງບໍ/i;
const DISCOUNT = /\b(discount|sale|promo(tion)?s?|coupon|deal)s?\b|ສ່ວນຫຼຸດ|ຫຼຸດລາຄາ|ໂປຣ|ໂປໂມຊັນ|ຄູປອງ/i;
const PRICE = /\b(how much|what('s| is) the price|price of|cost)\b|ເທົ່າໃດ|ເທົ່າໃດ|ລາຄາເທົ່າ/i;
const STOCK = /\b(in stock|still (have|available)|available|sold out|out of stock)\b|ຍັງມີ|ໝົດແລ້ວ|ໝົດບໍ|ເຫຼືອບໍ|ມີຂອງບໍ/i;
const CHEAPER = /\b(cheaper|less expensive|lower price)\b|ຖືກກວ່າ|ລາຄາຖືກກວ່າ|ຖືກໆ/i;
/** Questions about shops themselves: which shop is good, recommended, trusted. (Lao text is normalized: ໍາ → ຳ.) */
const SHOPS =
  /\b(recommend(ed)?|best|good|top|popular|trusted|reliable)\b.*\b(shops?|stores?|sellers?)\b|\b(shops?|stores?|sellers?)\b.*\b(recommend(ed)?|best|good|top|popular|trusted|reliable)\b|\bwhich (shop|store|seller)s?\b|ຮ້ານ(ຄ້າ)?\s*(ໃດ|ໃຫນ|ໃໜ|ໄຫນ|ໄໜ|ແນະນຳ|ດີ|ດັງ|ຂາຍດີ|ນິຍົມ|ເຊື່ອຖື|ໜ້າເຊື່ອຖື)|ແນະນຳ\s*ຮ້ານ|ຮ້ານ(ຄ້າ)?\s*(ຢູ່|ໃນ)|\b(shops?|stores?) (in|at|near)\b/i;
/** More of the same kind: "other ones", "different", "anything else", "ແບບອື່ນ", "ອັນອື່ນ", "ມີອີກບໍ". */
const MORE =
  /\b(any ?others?|other (ones?|options?|models?|kinds?|types?|brands?|styles?)|another (one|option|model|kind|type|brand|style)|different (ones?|options?|models?|kinds?|types?|brands?|styles?)|anything else|something else|alternatives?|more (options?|choices|models?|kinds?|types?|brands?|styles?))\b|ແບບອື່ນ|ອັນອື່ນ|ຢ່າງອື່ນ|ລຸ້ນອື່ນ|ຍີ່ຫໍ້ອື່ນ|ຕົວອື່ນ|ແບບໃໝ່|ອື່ນໆ|ມີອີກ/i;
/** "Which is better": comparing what's discussed. */
const COMPARE = /\b(which (one )?is better|which (one )?(should|do) i (buy|choose|get)|better one|compare|comparison|difference|vs\.?|versus)\b|ອັນໃດດີກວ່າ|ແບບໃດດີກວ່າ|ໂຕໃດດີກວ່າ|ດີກວ່າ|ອັນໃດດີ|ແບບໃດດີ|ໂຕໃດດີ|ຕ່າງກັນ|ປຽບທຽບ|ຄວນຊື້ອັນໃດ|ເລືອກອັນໃດ/i;
/** The lowest price (not "cheaper than this one"). */
const CHEAPEST = /\b(cheapest|lowest price|least expensive|most affordable)\b|ຖືກສຸດ|ຖືກທີ່ສຸດ|ລາຄາຕ່ຳສຸດ|ລາຄາຖືກສຸດ/i;
/** Buying many at a lower price each (bulk / tier prices). Before delivery: "ລາຄາສົ່ງ" is wholesale, not shipping. */
const BULK = /\b(wholesale|bulk|in bulk|buy (many|more|a lot|lots)|quantity (discount|price)|volume discount)\b|ລາຄາສົ່ງ|ຂາຍສົ່ງ|ຊື້ຫຼາຍ|ຊື້ເປັນຈຳນວນ|ຍົກໂຫຼ|ຍົກແພັກ|ຍົກລັງ/i;
/** New arrivals (not "a new phone": the whole message asks what's new). */
const NEW = /\b(what'?s new|new arrivals?|newest|latest products?|anything new|just arrived)\b|ມີຫຍັງໃໝ່|ຂອງໃໝ່|ສິນຄ້າໃໝ່|ມາໃໝ່|ລ່າສຸດ/i;
const GIFT = /\b(gifts?|presents?|souvenirs?|birthday|anniversary|valentine'?s?)\b|ຂອງຂວັນ|ຂອງຝາກ|ຂອງທີ່ລະນຶກ|ວັນເກີດ|ວາເລນທາຍ/i;
const WARRANTY = /\b(warranty|warranties|guarantee[ds]?)\b|ປະກັນ|ຮັບປະກັນ/i;
/** Asking for a recommendation of products. */
const RECOMMEND = /\b(recommend(ations?)?|suggest(ions?)?|best ?sell(ers?|ing)|popular|top picks?)\b|ແນະນຳ|ຂາຍດີ|ຍອດນິຍົມ|ນິຍົມ|ມີຫຍັງດີ/i;
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

export function detectIntent(raw: string): Intent | null {
  const text = normalizeLao(raw);
  if (BULK.test(text)) return { kind: 'bulk' };
  if (PAYMENT.test(text)) return { kind: 'payment' };
  if (DELIVERY.test(text)) return { kind: 'delivery', province: findProvince(text) };
  if (DISCOUNT.test(text)) return { kind: 'discount' };
  // About shops, or "other ones": never a product search for those words.
  if (SHOPS.test(text)) return { kind: 'shops' };
  if (MORE.test(text)) return { kind: 'more' };
  if (WARRANTY.test(text)) return { kind: 'warranty' };
  if (GIFT.test(text)) return { kind: 'gift' };
  if (NEW.test(text)) return { kind: 'new' };
  if (COMPARE.test(text)) return { kind: 'compare' };
  if (CHEAPEST.test(text)) return { kind: 'cheapest' };
  const size = SIZE.exec(text);
  if (size) return { kind: 'size', size: normalizeSize(size[1] ?? size[2] ?? size[3]) };
  if (PRICE.test(text)) return { kind: 'price' };
  if (CHEAPER.test(text)) return { kind: 'cheaper' };
  if (STOCK.test(text)) return { kind: 'stock' };
  if (RECOMMEND.test(text)) return { kind: 'recommend' };
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
  return normalizeLao(text)
    .replace(new RegExp(SHOPS.source, 'gi'), ' ')
    .replace(/\b(shops?|stores?|sellers?|sells?|selling)\b|ຮ້ານຄ້າ|ຮ້ານ|ຂາຍ/gi, ' ')
    .replace(new RegExp(MORE.source, 'gi'), ' ')
    .replace(new RegExp(RECOMMEND.source, 'gi'), ' ')
    .replace(new RegExp(COMPARE.source, 'gi'), ' ')
    .replace(new RegExp(CHEAPEST.source, 'gi'), ' ')
    .replace(new RegExp(BULK.source, 'gi'), ' ')
    .replace(new RegExp(WARRANTY.source, 'gi'), ' ')
    .replace(new RegExp(NEW.source, 'gi'), ' ')
    .replace(new RegExp(SIZE.source, 'gi'), ' ')
    .replace(new RegExp(PRICE.source, 'gi'), ' ')
    .replace(new RegExp(STOCK.source, 'gi'), ' ')
    .replace(new RegExp(CHEAPER.source, 'gi'), ' ');
}

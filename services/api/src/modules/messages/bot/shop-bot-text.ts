import type { BusinessHours, ProvinceCode, Weekday } from '@talad/shared';
import { WEEKDAYS } from '@talad/shared';
import { detectIntent } from '../../catalog/chat/chat-intents.js';
import { extractQuery, isGreeting, isThanks, takeColor, type ChatLocale, type Color } from '../../catalog/chat/chat-text.js';

/**
 * What a customer's message to a shop is about. The bot answers information questions with
 * text only and shows products only when the customer is asking about products.
 */
export type BotTopic =
  | { kind: 'faq'; index: number }
  | { kind: 'greeting' }
  | { kind: 'thanks' }
  /** An existing order, a return, a refund… — only the seller can help. */
  | { kind: 'order' }
  | { kind: 'hours' }
  | { kind: 'location' }
  | { kind: 'payment' }
  | { kind: 'delivery'; province: ProvinceCode | null }
  | { kind: 'discount' }
  | { kind: 'color'; color: Color; rest: string }
  | { kind: 'size'; size: string }
  | { kind: 'price' }
  | { kind: 'stock' }
  | { kind: 'cheaper' }
  /** Wants to order ("I'll take 2", "ເອົາ 2 ຜືນ ໄຊ L"): the bot sends an order card. */
  | { kind: 'buy'; quantity: number }
  /** Looking for products ("do you have coffee?"). */
  | { kind: 'search'; keywords: string[]; maxPrice: number | null }
  | { kind: 'unknown' };

/** Information topics: answered with text, never with product cards. */
export const INFO_TOPICS = new Set<BotTopic['kind']>(['faq', 'greeting', 'thanks', 'order', 'hours', 'location', 'payment', 'delivery', 'discount', 'unknown']);

const ORDER = /\b(my order|order status|order number|tracking|track|refund|return(ed|ing)?|cancel(led|ling)?|exchange|warranty|broken|damaged|wrong item|not (yet )?(arrived|received))\b|ຄຳສັ່ງຊື້|ອໍເດີ|ຕິດຕາມ|ສົ່ງຄືນ|ຄືນເງິນ|ຄືນສິນຄ້າ|ຍົກເລີກ|ຮັບປະກັນ|ເຄື່ອງເພ|ເປ່ເພ|ຍັງບໍ່ໄດ້ຮັບ|\bTL\d{6,}/i;
const BUY =
  /\b(i('ll| will) take|i('d| would) like (to (buy|order)|it|this|one)|i want (to (buy|order)|it|this|one)|buy (it|this|that|one|now|\d)|order (it|this|that|one|now|\d)|add to cart|place an order|check ?out|i('ll| will) buy)\b|^(buy|order)\b|ເອົາ|ສັ່ງຊື້|ຂໍສັ່ງ|ຢາກສັ່ງ|ສັ່ງ|ຊື້/i;
const UNITS = 'pcs|pieces?|units?|ອັນ|ຜືນ|ໂຕ|ຖົງ|ກ່ອງ|ຊຸດ|ແກ້ວ|ຄູ່|ໜ່ວຍ|ເມັດ|ກະປ໋ອງ|ຂວດ|ແພັກ';
const LAO_NUMBERS: Record<string, number> = { ໜຶ່ງ: 1, ສອງ: 2, ສາມ: 3, ສີ່: 4, ຫ້າ: 5, ຫົກ: 6, ເຈັດ: 7, ແປດ: 8, ເກົ້າ: 9, ສິບ: 10 };
const EN_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1 };

/** How many the customer wants: "2 ຜືນ", "x3", "ສອງອັນ", "two pieces"; 1 when not said. */
export function orderQuantity(text: string): number {
  return saidQuantity(text) ?? 1;
}

/** The quantity in the message, or null when it doesn't say one. */
export function saidQuantity(text: string): number | null {
  const low = text.toLowerCase();
  const unit = new RegExp(`(\\d{1,2})\\s*(?:${UNITS})`).exec(low) ?? /[x×]\s*(\d{1,2})\b/.exec(low) ?? /\b(?:take|buy|order|want)\s+(\d{1,2})\b/.exec(low) ?? /(?:ເອົາ|ສັ່ງ|ຊື້)\s*(\d{1,2})(?!\d)/.exec(low);
  if (unit) return Number(unit[1]);
  const lao = new RegExp(`(${Object.keys(LAO_NUMBERS).join('|')})\\s*(?:${UNITS})`).exec(low);
  if (lao) return LAO_NUMBERS[lao[1]];
  const en = new RegExp(`\\b(${Object.keys(EN_NUMBERS).filter((w) => w !== 'a').join('|')})\\s+(?:${UNITS})\\b`).exec(low);
  return en ? EN_NUMBERS[en[1]] : null;
}

/** The message without its "I'll take 2 …" words, so what's left names the product. */
export function stripBuyWords(text: string): string {
  return text
    .replace(new RegExp(BUY.source, 'gi'), ' ')
    .replace(new RegExp(`\\d{1,2}\\s*(?:${UNITS})`, 'gi'), ' ')
    .replace(new RegExp(`(${Object.keys(LAO_NUMBERS).join('|')})\\s*(?:${UNITS})`, 'g'), ' ')
    .replace(/[x×]\s*\d{1,2}\b/gi, ' ');
}

const HOURS = /\b(open(ing)?|clos(e|ed|ing)|business hours|opening hours|what time)\b|ເປີດ|ປິດ|ຈັກໂມງ|ເວລາ/i;
const LOCATION = /\b(where (are|is) (you|the shop|your shop)|address|location|located|pick ?up|visit (you|the shop)|map)\b|ທີ່ຢູ່|ຢູ່ໃສ|ຢູ່ບ່ອນໃດ|ໜ້າຮ້ານ|ແຜນທີ່|ໄປຮັບເອງ|ຮັບເອງ/i;

/** Words that carry no meaning for matching FAQs ("can I…", "ໄດ້ບໍ"). */
const FAQ_FILLER_EN = new Set(
  'a an the i im me my we you your our is are am be do does did can could would will should may please pls hi hello hey thanks thank to of for in on at it this that there here what how when which who any some with and or if so just'.split(' '),
);
const FAQ_FILLER_LO = ['ສະບາຍດີ', 'ຂອບໃຈ', 'ຂ້ອຍ', 'ເຈົ້າ', 'ທ່ານ', 'ໄດ້ບໍ່', 'ໄດ້ບໍ', 'ບໍ່', 'ບໍ', 'ແດ່', 'ເດີ້', 'ນໍ', 'ຄັບ', 'ແມ່ນ', 'ສາມາດ', 'ຫຍັງ', 'ແນວໃດ', 'ໄດ້', 'ມີ'].sort((a, b) => b.length - a.length);

function faqWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !FAQ_FILLER_EN.has(w) && !/[຀-໿]/.test(w));
}

/** Lao is written without spaces: compare it by letter pairs, with filler particles removed. */
function laoPairs(text: string): Set<string> {
  let lao = (text.match(/[຀-໿]+/g) ?? []).join(' ');
  for (const f of FAQ_FILLER_LO) lao = lao.split(f).join(' ');
  const pairs = new Set<string>();
  for (const chunk of lao.split(/\s+/)) for (let i = 0; i < chunk.length - 1; i++) pairs.add(chunk.slice(i, i + 2));
  return pairs;
}

const dice = <T>(a: Set<T>, b: Set<T>) => {
  if (!a.size || !b.size) return 0;
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return (2 * both) / (a.size + b.size);
};

/** How close a message is to an FAQ question (0–1), in English words and Lao letter pairs. */
export function faqScore(message: string, question: string): number {
  return Math.max(dice(new Set(faqWords(message)), new Set(faqWords(question))), dice(laoPairs(message), laoPairs(question)));
}

/** A message this close to an FAQ question gets that FAQ's answer. */
export const FAQ_MIN_SCORE = 0.55;

/** The best-matching FAQ, if it's close enough. */
export function matchFaq(message: string, questions: string[]): number | null {
  let best = -1;
  let score = 0;
  questions.forEach((q, i) => {
    const s = faqScore(message, q);
    if (s > score) [best, score] = [i, s];
  });
  return best >= 0 && score >= FAQ_MIN_SCORE ? best : null;
}

/** Works out what the message asks, most specific first. The seller's own FAQs win. */
export function analyse(message: string, faqQuestions: string[] = []): BotTopic {
  const text = message.trim();
  if (!text) return { kind: 'unknown' };
  const faq = matchFaq(text, faqQuestions);
  if (faq !== null) return { kind: 'faq', index: faq };
  if (isGreeting(text)) return { kind: 'greeting' };
  if (isThanks(text)) return { kind: 'thanks' };
  if (ORDER.test(text)) return { kind: 'order' };
  if (BUY.test(text)) return { kind: 'buy', quantity: Math.max(1, Math.min(99, orderQuantity(text))) };
  if (HOURS.test(text)) return { kind: 'hours' };
  if (LOCATION.test(text)) return { kind: 'location' };
  const { color, rest } = takeColor(text);
  const intent = detectIntent(text);
  if (intent && (intent.kind === 'payment' || intent.kind === 'delivery' || intent.kind === 'discount')) return intent;
  if (color) return { kind: 'color', color, rest };
  if (intent) return intent;
  const query = extractQuery(text);
  if (query.keywords.length) return { kind: 'search', keywords: query.keywords, maxPrice: query.maxPrice };
  return { kind: 'unknown' };
}

const DAY_NAMES: Record<ChatLocale, Record<Weekday, string>> = {
  en: { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' },
  lo: { mon: 'ຈັນ', tue: 'ອັງຄານ', wed: 'ພຸດ', thu: 'ພະຫັດ', fri: 'ສຸກ', sat: 'ເສົາ', sun: 'ອາທິດ' },
};

/**
 * Opening hours in one line, with runs of days that share hours grouped:
 * "Mon–Fri 08:00–18:00, Sat 09:00–12:00 (closed Sun)". Null when the shop set none.
 */
export function describeHours(hours: BusinessHours | null | undefined, lang: ChatLocale): string | null {
  if (!hours || !WEEKDAYS.some((d) => hours[d])) return null;
  const names = DAY_NAMES[lang];
  const runs: { from: Weekday; to: Weekday; time: string }[] = [];
  for (const day of WEEKDAYS) {
    const h = hours[day];
    if (!h) continue;
    const time = `${h.open}–${h.close}`;
    const last = runs.at(-1);
    if (last && last.time === time && WEEKDAYS.indexOf(last.to) === WEEKDAYS.indexOf(day) - 1) last.to = day;
    else runs.push({ from: day, to: day, time });
  }
  const closed = WEEKDAYS.filter((d) => !hours[d]).map((d) => names[d]);
  const open = runs.map((r) => `${names[r.from]}${r.to !== r.from ? `–${names[r.to]}` : ''} ${r.time}`).join(', ');
  if (!closed.length) return open;
  return lang === 'lo' ? `${open} (ປິດ ${closed.join(', ')})` : `${open} (closed ${closed.join(', ')})`;
}

/** Text helpers for Market Chat's built-in assistant (used when Claude isn't available). */
export type ChatLocale = 'lo' | 'en';

/**
 * Filler words removed before searching. Lao is written without spaces, so Lao fillers are
 * peeled off the start and end of each chunk ("ຢາກໄດ້ກາເຟ" → "ກາເຟ") — never from the middle,
 * and never when that would leave a single letter ("ມີດ", knife, stays).
 */
const EN_STOP = new Set(
  'hi hello hey thanks thank about also else other more maybe just really i im i\'m me my we you a an the some any for of to in on with and or is are do does have has want wanna need needs looking look find show buy get give please pls can could would like any there here something thing things one ones it this that what which where how much price cheap good best new sell sells selling carry stock got'.split(' '),
);
const LO_STOP = [
  'ສະບາຍດີ', 'ຂອບໃຈ', 'ຂ້ອຍ', 'ຂ້າພະເຈົ້າ', 'ເຮົາ', 'ຢາກໄດ້', 'ຢາກ', 'ຕ້ອງການ', 'ຊອກຫາ', 'ຊອກ', 'ຫາ', 'ໄດ້', 'ຊື້', 'ມີ', 'ບໍ່', 'ບໍ', 'ແດ່', 'ແນ່', 'ຂໍ',
  'ເບິ່ງ', 'ອັນ', 'ໜ່ອຍ', 'ໜຶ່ງ', 'ເດີ້', 'ເດ', 'ເຈົ້າ', 'ແມ່ນ', 'ຫຍັງ', 'ຢູ່', 'ໃດ', 'ແລະ', 'ກັບ', 'ສຳລັບ', 'ໃຫ້', 'ຄືກັນ', 'ລາຄາ',
  'ຖືກ', 'ດີ', 'ຫຼາຍ', 'ແດ່ເດີ້', 'ນໍ', 'ບໍ່ເກີນ', 'ຕ່ຳກວ່າ', 'ກີບ', 'ພັນ',
  'ອັນນີ້', 'ອັນນັ້ນ', 'ນີ້', 'ນັ້ນ', 'ແບບນີ້', 'ໂຕນີ້', 'ຜືນນີ້',
].sort((a, b) => b.length - a.length);

const GREETINGS = /^(hi+|hello|hey|yo|good (morning|afternoon|evening)|ສະບາຍດີ|ສະບາຍດີເຈົ້າ|ສະບາຍດີຄັບ|ຫວັດດີ|ດີ|ດີເຈົ້າ|ດີຄັບ|hello there)[\s!.?😊👋]*$/iu;
const THANKS = /^(thanks?( you)?|thx|ty|ok(ay)? thanks?|ຂອບໃຈ(ຫຼາຍ)?(ເດີ້|ເຈົ້າ|ຄັບ)?|ຂອບໃຈເດີ້)[\s!.😊🙏]*$/iu;

export const isGreeting = (text: string) => GREETINGS.test(text.trim());
export const isThanks = (text: string) => THANKS.test(text.trim());

/**
 * Search words and an optional price ceiling from a chat message, e.g.
 * "I want wireless earbuds under 300k" → ["wireless", "earbuds"], 300000;
 * "ຢາກໄດ້ກາເຟ ລາຄາບໍ່ເກີນ 100,000 ກີບ" → ["ກາເຟ"], 100000.
 */
export function extractQuery(text: string): { keywords: string[]; maxPrice: number | null } {
  let rest = text.toLowerCase();
  let maxPrice: number | null = null;
  const price = /(?:under|below|less than|max|up to|<|ບໍ່ເກີນ|ຕ່ຳກວ່າ|ບໍ່ເກີນກວ່າ)\s*₭?\s*([\d][\d,.]*)\s*(k|ພັນ|000)?/i.exec(rest);
  if (price) {
    const n = Number(price[1].replace(/[,.]/g, ''));
    maxPrice = n ? n * (price[2] === 'k' || price[2] === 'ພັນ' ? 1000 : 1) : null;
    rest = rest.replace(price[0], ' ');
  }
  const words = rest
    .replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .map(stripLao)
    .filter((w) => w.length > 1 && !EN_STOP.has(w) && !LO_STOP.includes(w) && !/^\d+$/.test(w));
  return { keywords: [...new Set(words)].slice(0, 8), maxPrice };
}

function stripLao(chunk: string): string {
  for (let changed = true; changed; ) {
    changed = false;
    for (const w of LO_STOP) {
      if (chunk.length - w.length < 2) continue;
      if (chunk.startsWith(w)) chunk = chunk.slice(w.length);
      else if (chunk.endsWith(w)) chunk = chunk.slice(0, -w.length);
      else continue;
      changed = true;
    }
  }
  return chunk;
}

/**
 * Everyday shopping words in Lao and English, so the built-in assistant can match a Lao
 * question to English product names and the other way round. Claude doesn't need this.
 */
const GLOSSARY: [lo: string, en: string][] = [
  ['ກາເຟ', 'coffee'], ['ຊາ', 'tea'], ['ເຂົ້າໜຽວ', 'sticky rice'], ['ເຂົ້າ', 'rice'], ['ແຈ່ວບອງ', 'jeow bong'], ['ແຈ່ວ', 'chili paste'],
  ['ໝາກເຜັດ', 'chili'], ['ນ້ຳມັນໝາກພ້າວ', 'coconut oil'], ['ໝາກພ້າວ', 'coconut'], ['ນ້ຳມັນ', 'oil'], ['ນ້ຳເຜິ້ງ', 'honey'], ['ອາຫານ', 'food'],
  ['ກະຕິບ', 'sticky rice basket'], ['ເສື້ອຍືດ', 't-shirt'], ['ເສື້ອຜ້າ', 'clothes'], ['ເສື້ອ', 'shirt'], ['ສິ້ນ', 'sinh skirt'], ['ກະໂປ່ງ', 'skirt'],
  ['ໄໝ', 'silk'], ['ຜ້າ', 'fabric'], ['ເກີບ', 'shoes'], ['ກະເປົາ', 'bag'], ['ໂມງ', 'watch'], ['ໝວກ', 'hat'],
  ['ຫູຟັງ', 'earbuds'], ['ຫູຟັງ', 'headphones'], ['ລຳໂພງ', 'speaker'], ['ໂທລະສັບ', 'phone'], ['ສາຍສາກ', 'charger'], ['ທີ່ສາກ', 'charger'],
  ['ແບັດສຳຮອງ', 'power bank'], ['ພາວເວີແບັງ', 'power bank'], ['ຄອມພິວເຕີ', 'computer'], ['ແມວ', 'cat'], ['ໝາ', 'dog'], ['ສັດລ້ຽງ', 'pet'],
  ['ເດັກນ້ອຍ', 'baby'], ['ທິດຊູ່ປຽກ', 'wipes'], ['ຜ້າອ້ອມ', 'diapers'], ['ໂຍຄະ', 'yoga'], ['ເສື່ອ', 'mat'], ['ອອກກຳລັງກາຍ', 'exercise'],
  ['ເຄື່ອງສຳອາງ', 'cosmetics'], ['ສະບູ', 'soap'], ['ແຊມພູ', 'shampoo'], ['ຂອງຂວັນ', 'gift'], ['ຂອງຫຼິ້ນ', 'toy'], ['ເຄື່ອງຄົວ', 'kitchen'],
];

/** One thing the customer asked for, with its Lao/English alternatives; `known` = in the glossary. */
export interface Concept {
  alternatives: string[];
  known: boolean;
}

const isLao = (s: string) => /[\u0E80-\u0EFF]/.test(s);
const wholeWord = (text: string, word: string) => new RegExp(`(^|[^a-z])${word.replace(/[-]/g, '\\-')}($|[^a-z])`).test(text);

/**
 * The concepts in a question: "ອາຫານແມວ" → food + cat; "ຫູຟັງ" → earbuds/headphones;
 * "lao coffee" → lao (unknown) + coffee/ກາເຟ. A product matches exactly when it matches
 * every concept (any alternative of each).
 */
export function toConcepts(keywords: string[]): Concept[] {
  const out: Concept[] = [];
  for (const k of keywords) {
    if (isLao(k)) {
      // Lao compounds: every glossary term inside the chunk, longest first, without overlaps.
      let rest = k;
      const terms: string[] = [];
      for (const lo of [...new Set(GLOSSARY.map(([l]) => l))].sort((a, b) => b.length - a.length)) {
        if (rest.includes(lo)) {
          terms.push(lo);
          rest = rest.split(lo).join(' ');
        }
      }
      if (!terms.length) out.push({ alternatives: [k], known: false });
      for (const lo of terms) out.push({ alternatives: [lo, ...GLOSSARY.filter(([l]) => l === lo).map(([, en]) => en)], known: true });
    } else {
      const low = k.toLowerCase();
      const los = GLOSSARY.filter(([, en]) => wholeWord(low, en)).map(([lo]) => lo);
      out.push({ alternatives: [k, ...new Set(los)], known: los.length > 0 });
    }
  }
  return out;
}

/** Colours customers ask for: English names and the Lao "ສີ…" forms. */
const COLORS: { en: string; lo: string; words: string[] }[] = [
  { en: 'pink', lo: 'ສີບົວ', words: ['pink', 'ສີບົວ', 'ສີຊົມພູ'] },
  { en: 'red', lo: 'ສີແດງ', words: ['red', 'ສີແດງ'] },
  { en: 'black', lo: 'ສີດຳ', words: ['black', 'ສີດຳ'] },
  { en: 'white', lo: 'ສີຂາວ', words: ['white', 'ສີຂາວ'] },
  { en: 'green', lo: 'ສີຂຽວ', words: ['green', 'ສີຂຽວ'] },
  { en: 'blue', lo: 'ສີຟ້າ', words: ['blue', 'navy', 'ສີຟ້າ', 'ສີນ້ຳເງິນ'] },
  { en: 'yellow', lo: 'ສີເຫຼືອງ', words: ['yellow', 'ສີເຫຼືອງ'] },
  { en: 'grey', lo: 'ສີເທົາ', words: ['grey', 'gray', 'ສີເທົາ'] },
  { en: 'brown', lo: 'ສີນ້ຳຕານ', words: ['brown', 'ສີນ້ຳຕານ'] },
  { en: 'purple', lo: 'ສີມ່ວງ', words: ['purple', 'violet', 'ສີມ່ວງ'] },
  { en: 'orange', lo: 'ສີສົ້ມ', words: ['orange', 'ສີສົ້ມ'] },
];
export type Color = (typeof COLORS)[number];

/** The colour asked for (if any) and the text without it: "ມີສີບົວບໍ?" → pink, "ມີບໍ?". */
export function takeColor(text: string): { color: Color | null; rest: string } {
  const low = text.toLowerCase();
  for (const c of COLORS) {
    for (const w of c.words) {
      const found = /[a-z]/.test(w) ? new RegExp(`(^|[^a-z])${w}($|[^a-z])`).test(low) : low.includes(w);
      if (found) return { color: c, rest: low.replace(w, ' ') };
    }
  }
  return { color: null, rest: text };
}

/** True when a product (name, description or option values) comes in the colour. */
export function hasColor(c: Color, texts: string[]): boolean {
  const low = texts.join(' ').toLowerCase();
  return c.words.some((w) => (/[a-z]/.test(w) ? new RegExp(`(^|[^a-z])${w}($|[^a-z])`).test(low) : low.includes(w) || low.includes(w.replace('ສີ', ''))));
}

/**
 * Reply in the language the customer writes in. A photo with no text (or digits only)
 * keeps the conversation's language; the app language when there's nothing to go by.
 */
export function replyLanguage(message: string, history: { role: 'user' | 'assistant'; text: string }[], appLocale: ChatLocale): ChatLocale {
  const lao = /[\u0E80-\u0EFF]/;
  for (const text of [message, ...history.filter((t) => t.role === 'user').map((t) => t.text).reverse()]) {
    if (lao.test(text)) return 'lo';
    if (/[a-z]{2,}/i.test(text.replace(/\[photo\]/gi, ''))) return 'en';
  }
  return appLocale;
}

/** A subject's words in the reply language: each concept's Lao or English alternative. */
export function labelOf(concepts: Concept[], lang: ChatLocale): string {
  const lao = /[\u0E80-\u0EFF]/;
  return concepts
    .map((c) => c.alternatives.find((a) => (lang === 'lo' ? lao.test(a) : !lao.test(a))) ?? c.alternatives[0])
    .join(' ');
}

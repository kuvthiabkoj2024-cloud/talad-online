import { AUTO_COMPLETE_DAYS, formatMoney, GUARANTEE_RULES, MC_MART_CONTACT, RETURN_RULES } from '@talad/shared';
import { normalizeLao, type ChatLocale } from './chat-text.js';

/**
 * Questions about MC Mart itself rather than a product (Market Chat's built-in assistant):
 * orders and tracking, returns, delivery fee and time, how to buy or sell, contact, points,
 * the account, opening hours, who the assistant is, and short replies like "ok" or "bye".
 * Without this, any of them would be searched for as a product ("ເຈົ້າແມ່ນໃຜ" → "ໃຜ").
 */
export type HelpTopic =
  | 'orders'
  | 'cancel'
  | 'paymentCheck'
  | 'returns'
  | 'deliveryFee'
  | 'deliveryTime'
  | 'howToBuy'
  | 'sell'
  | 'contact'
  | 'points'
  | 'account'
  | 'hours'
  | 'authentic'
  | 'about'
  | 'bye'
  | 'ack';

/** Checked in order: the more specific first. Lao text is normalized first (ໍາ → ຳ). */
const TOPICS: [HelpTopic, RegExp][] = [
  // Short replies that ask nothing: the whole message is just this.
  ['bye', /^(bye|bye bye|goodbye|good bye|see you|see ya|cya|ບາຍ|ບາຍບາຍ|ບ໊າຍ|ລາກ່ອນ|ໄປກ່ອນເດີ້|ໄປກ່ອນ)[\s!.👋😊🙏ເດີ້ເຈົ້າຄັບ]*$/iu],
  [
    'ack',
    /^(ok(ay)?|k|kk|alright|sure|fine|got it|i see|cool|great|nice|good|no|nope|nothing|not now|later|maybe later|ໂອເຄ|ໂອເຄເດີ້|ໂອ|ໄດ້|ໄດ້ເລີຍ|ໄດ້ແລ້ວ|ຕົກລົງ|ເຂົ້າໃຈແລ້ວ|ເຂົ້າໃຈ|ບໍ່ເປັນຫຍັງ|ບໍ່ມີ|ບໍ່ມີຫຍັງ|ບໍ່ມີແລ້ວ|ພໍແລ້ວ|ຈັ່ງຊັ້ນ|ແມ່ນແລ້ວ|ເຈົ້າ|ຄັບ|ດີຫຼາຍ|👍|👌|🙏|😊)[\s!.ໆ👍👌🙏😊ເດີ້ເຈົ້າຄັບ]*$/iu,
  ],
  ['about', /^(hi |hello )?(who are you|what are you|what can you do|what do you do|help|help me|how does (this|it) work|are you (a )?(bot|robot|ai|human))\W*$|ເຈົ້າແມ່ນໃຜ|ນີ້ແມ່ນໃຜ|ແມ່ນໃຜ|ເຮັດຫຍັງໄດ້ແດ່|ຊ່ວຍຫຍັງໄດ້|ເປັນຄົນ(ບໍ|ຫຼືບໍ)|ເປັນ(ບອດ|ໂຣບອດ|AI)|^ຊ່ວຍແດ່\W*$/iu],
  // Before "delivery" and "price": the fee and the time are their own questions.
  ['deliveryFee', /\b(shipping|delivery) (fees?|costs?|price|charges?)\b|\bhow much (is|for|does) (the )?(shipping|delivery)\b|\bfree (shipping|delivery)\b|ຄ່າສົ່ງ|ຄ່າຂົນສົ່ງ|ຄ່າຈັດສົ່ງ|ສົ່ງຟຣີ|ສົ່ງຟີ/i],
  ['deliveryTime', /\bhow long\b.*\b(deliver|delivery|ship|shipping|take|arrive)|\b(when will (it|my order|the order) (come|arrive)|delivery time|how many days|urgent delivery|express delivery|same[- ]day|fast delivery)\b|ສົ່ງດ່ວນ|ສົ່ງໄວ|ມື້ດຽວຮອດ|ຈັກມື້|ຈັກວັນ|ດົນປານໃດ|ດົນບໍ|ມື້ໃດຈະຮອດ|ມື້ໃດຮອດ|ຈະຮອດມື້ໃດ|ໃຊ້ເວລາ/i],
  // Before "orders": "how do I cancel my order" is about cancelling.
  ['cancel', /\b(cancel(l?ing|l?ed)?|call off)\b.*\b(order|it|purchase)\b|\bcancel\b|ຍົກເລີກ/i],
  ['paymentCheck', /\b(i('ve| have)? (already )?paid|already paid|paid (but|already)|payment (not|isn'?t|wasn'?t|still not) (confirmed|approved|verified)|slip (rejected|not (approved|confirmed)))\b|ຈ່າຍ(ເງິນ)?ແລ້ວ|ໂອນ(ເງິນ)?ແລ້ວ|ສະລິບ(ຖືກ)?ປະຕິເສດ|ຍັງບໍ່ຢືນຢັນ(ການ)?(ຈ່າຍ|ໂອນ|ເງິນ)?|ການຈ່າຍເງິນບໍ່ຜ່ານ/i],
  ['orders', /\b(my orders?|order status|where('s| is) my (order|parcel|stuff)|track(ing)?( my)?( order| parcel)?|parcel|not (arrived|received) yet|haven'?t (got|received))\b|ຕິດຕາມ(ຄຳສັ່ງ|ອໍເດີ|ພັດສະດຸ|ເຄື່ອງ|ສິນຄ້າ|ການຈັດສົ່ງ)|ພັດສະດຸ|ຄຳສັ່ງຊື້ຂ້ອຍ|ອໍເດີຂ້ອຍ|ຂອງຂ້ອຍ(ຮອດ|ຢູ່ໃສ)|ຮອດໃສ|ເຖິງໃສ|ຮອດຍັງ|ຍັງບໍ່ຮອດ|ຍັງບໍ່ໄດ້ຮັບ|ສະຖານະ(ຄຳສັ່ງ|ອໍເດີ)/i],
  ['returns', /\b(return(s|ing)?|refund(s|ed)?|exchange|money back|send (it )?back)\b|ປ່ຽນຄືນ|ສົ່ງຄືນ|ຄືນເງິນ|ເງິນຄືນ|ຄືນສິນຄ້າ|ປ່ຽນສິນຄ້າ|ປ່ຽນໄດ້ບໍ|ເປ່ເພ|ເພເສຍ|ຊຳລຸດ|ບໍ່ຕົງປົກ|ໄດ້ຂອງຜິດ/i],
  // "How do I sell on MC Mart" — not "do you sell coffee?".
  ['sell', /\b(sell on|selling on|start selling|how (can|do) i sell|open (a |my )?(shop|store)|become a (seller|vendor)|seller (account|center|centre)|register (a |my )?(shop|store))\b|ເປີດຮ້ານ|ຢາກຂາຍຂອງ|ຢາກຂາຍ|ເປັນຜູ້ຂາຍ|ລົງທະບຽນຮ້ານ|ສະໝັກຮ້ານ|ສະໝັກຂາຍ|ຝາກຂາຍ/i],
  ['howToBuy', /\bhow (do|can|to) (i )?(buy|order|purchase|check ?out)\b|\bhow to (buy|order)\b|\bplace an order\b|ສັ່ງຊື້ແນວໃດ|ຊື້ແນວໃດ|ສັ່ງແນວໃດ|ວິທີສັ່ງ|ວິທີຊື້|ສັ່ງຢູ່ໃສ|ຊື້ຢູ່ໃສ|ສັ່ງຊື້ຍັງໃດ|ສັ່ງຍັງໃດ/i],
  ['contact', /\b(contact|customer (service|support|care)|support|admin|hotline|phone number|call (you|someone)|talk to (a |an )?(person|human|someone|staff|agent|admin)|real person|whatsapp|facebook page)\b|ຕິດຕໍ່|ແອດມິນ|ແອັດມິນ|ເບີໂທ|ໂທຫາ|ລົມກັບຄົນ|ພະນັກງານ|ຝ່າຍບໍລິການ|ເຟສບຸກ|ວອດແອັບ/i],
  ['points', /\b(points?|loyalty|rewards?)\b|ຄະແນນ|ພ້ອຍ|ພອຍ/i],
  ['account', /\b(password|log ?in|sign ?in|sign ?up|register|my account|change (my )?(address|phone|number|name|email)|otp|verification code|delete (my )?account)\b|ລະຫັດຜ່ານ|ເຂົ້າສູ່ລະບົບ|ລັອກອິນ|ລັອກອີນ|ສະໝັກສະມາຊິກ|ສະໝັກບັນຊີ|ປ່ຽນທີ່ຢູ່|ປ່ຽນເບີ|ລະຫັດ ?otp|ລະຫັດຢືນຢັນ|ລຶບບັນຊີ/i],
  ['hours', /\b(opening hours?|open hours?|what time|when (are|do) you (open|close)|are you open|24\/7)\b|ເປີດຈັກໂມງ|ປິດຈັກໂມງ|ເວລາເປີດ|ເປີດມື້ໃດ|ເປີດບໍ|ປິດບໍ|ເປີດຢູ່ບໍ/i],
  ['authentic', /\b(original|authentic|genuine|real or fake|fake|counterfeit|legit|trustworthy|scam|is it safe|safe to (buy|pay))\b|ຂອງແທ້|ແທ້ບໍ|ແທ້ຫຼືບໍ|ຂອງປອມ|ປອມບໍ|ເຊື່ອໄດ້ບໍ|ເຊື່ອຖືໄດ້ບໍ|ປອດໄພບໍ|ຕົ້ມຕຸ໋ນ|ໂກງ/i],
];

export function detectHelp(raw: string): HelpTopic | null {
  const text = normalizeLao(raw).trim();
  if (!text) return null;
  return TOPICS.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** Live facts the answers use (from the database and the platform settings). */
export interface HelpFacts {
  /** Payment methods offered, already in words. */
  payments: string[];
  /** Points: 1 point = this many kip off; they expire after `expiryDays` (null: never). */
  points: { redeemValue: number; expiryDays: number | null } | null;
  /** The signed-in customer's orders on their way (null: a guest). */
  orders: { number: string; status: string; carrier: string | null; tracking: string | null }[] | null;
}

const STATUS: Record<ChatLocale, Record<string, string>> = {
  en: { PENDING: 'waiting for payment', CONFIRMED: 'paid, being prepared', PACKED: 'packed', SHIPPED: 'on its way', DELIVERED: 'delivered — please confirm', RETURN_REQUESTED: 'return being reviewed' },
  lo: { PENDING: 'ລໍຖ້າການຊຳລະ', CONFIRMED: 'ຈ່າຍແລ້ວ, ຮ້ານກຳລັງກະກຽມ', PACKED: 'ແພັກແລ້ວ', SHIPPED: 'ກຳລັງຈັດສົ່ງ', DELIVERED: 'ສົ່ງຮອດແລ້ວ — ກະລຸນາຢືນຢັນ', RETURN_REQUESTED: 'ກຳລັງກວດສອບການຄືນສິນຄ້າ' },
};

/** The answer to a help topic, in the conversation's language. */
export function helpAnswer(topic: HelpTopic, lang: ChatLocale, facts: HelpFacts): string {
  const c = MC_MART_CONTACT;
  const days = RETURN_RULES.windowDays;
  if (lang === 'lo') {
    switch (topic) {
      case 'bye':
        return 'ຂອບໃຈທີ່ແວ່ມາເດີ້! 👋 ກັບມາຊອກຫາສິນຄ້າໄດ້ທຸກເວລາ.';
      case 'ack':
        return 'ໂອເຄເດີ້ 😊 ມີຫຍັງໃຫ້ຊ່ວຍຊອກອີກບໍ່? ພິມຊື່ສິນຄ້າ ຫຼື ສົ່ງຮູບມາໄດ້ເລີຍ.';
      case 'about':
        return 'ຂ້ອຍແມ່ນ ແຊັດຕະຫຼາດ — ຜູ້ຊ່ວຍຊື້ເຄື່ອງຂອງ MC Mart 🤖 ຂ້ອຍຊ່ວຍໄດ້:\n• ຊອກສິນຄ້າຈາກຊື່ ຫຼື ຮູບ\n• ປຽບທຽບລາຄາ, ສີ, ໄຊ, ສິນຄ້າທີ່ຖືກກວ່າ\n• ແນະນຳຮ້ານ ແລະ ສິນຄ້າຂາຍດີ\n• ຕອບເລື່ອງການຈັດສົ່ງ, ການຈ່າຍເງິນ, ການຄືນສິນຄ້າ ແລະ ຕິດຕາມຄຳສັ່ງຊື້\nລອງຖາມໄດ້ເລີຍ!';
      case 'deliveryFee':
        return 'ຄ່າສົ່ງບໍ່ລວມໃນລາຄາສິນຄ້າ: ທ່ານຈ່າຍໃຫ້ບໍລິສັດຂົນສົ່ງຕອນຮັບເຄື່ອງ (ລາຄາຂຶ້ນກັບບໍລິສັດ ແລະ ແຂວງ). ບາງຮ້ານສົ່ງຟຣີໃນໄລຍະໃກ້ — ປັກໝຸດທີ່ຢູ່ຂອງທ່ານໃນແຜນທີ່ຕອນສັ່ງຊື້ເພື່ອກວດເບິ່ງ. ການຮັບເອງທີ່ຮ້ານແມ່ນຟຣີ.';
      case 'deliveryTime':
        return `ຮ້ານຈະກະກຽມ ແລະ ສົ່ງເຄື່ອງຫຼັງຈາກຢືນຢັນການຈ່າຍເງິນ; ໄລຍະເວລາຂົນສົ່ງຂຶ້ນກັບບໍລິສັດ ແລະ ແຂວງຂອງທ່ານ. ບາງຮ້ານມີການສົ່ງດ່ວນເອງ. ທ່ານຕິດຕາມສະຖານະໄດ້ໃນ "ຄຳສັ່ງຊື້ຂອງຂ້ອຍ" ຫຼື ໜ້າ "ຕິດຕາມຄຳສັ່ງຊື້".`;
      case 'orders':
        if (facts.orders?.length)
          return [`ຄຳສັ່ງຊື້ຂອງທ່ານທີ່ກຳລັງດຳເນີນການ:`, ...facts.orders.map((o) => `• ${o.number} — ${STATUS.lo[o.status] ?? o.status}${o.carrier ? ` · ${o.carrier}` : ''}${o.tracking ? ` (${o.tracking})` : ''}`), 'ເບິ່ງລາຍລະອຽດໄດ້ໃນ "ຄຳສັ່ງຊື້ຂອງຂ້ອຍ".'].join('\n');
        if (facts.orders) return 'ຕອນນີ້ທ່ານບໍ່ມີຄຳສັ່ງຊື້ທີ່ກຳລັງສົ່ງ. ຄຳສັ່ງຊື້ເກົ່າເບິ່ງໄດ້ໃນ "ຄຳສັ່ງຊື້ຂອງຂ້ອຍ".';
        return 'ຕິດຕາມຄຳສັ່ງຊື້ໄດ້ທີ່ປຸ່ມ "ຕິດຕາມຄຳສັ່ງຊື້" ດ້ານເທິງ: ໃສ່ເລກທີຄຳສັ່ງຊື້ ແລະ ເບີໂທທີ່ໃຊ້ສັ່ງ. ຖ້າເຂົ້າສູ່ລະບົບ, ຂ້ອຍບອກສະຖານະໃຫ້ໄດ້ເລີຍ.';
      case 'cancel':
        return 'ຄຳສັ່ງຊື້ທີ່ຍັງບໍ່ໄດ້ຈ່າຍເງິນ (ຫຼື ສະລິບຖືກປະຕິເສດ) ຍົກເລີກໄດ້ເອງໃນ "ຄຳສັ່ງຊື້ຂອງຂ້ອຍ" → ເລືອກຄຳສັ່ງຊື້ → "ຍົກເລີກຄຳສັ່ງຊື້". ຖ້າຈ່າຍແລ້ວ ຫຼື ຮ້ານກຳລັງກະກຽມ, ກະລຸນາແຊັດກັບຮ້ານໂດຍກົງ. ຖ້າໄດ້ຮັບເຄື່ອງແລ້ວ ໃຫ້ຂໍຄືນສິນຄ້າແທນ.';
      case 'paymentCheck':
        return [
          'ຫຼັງຈາກສົ່ງສະລິບ, MC Mart ຈະກວດການໂອນ ແລ້ວສົ່ງຄຳສັ່ງຊື້ໃຫ້ຮ້ານທັນທີທີ່ຢືນຢັນ. ຖ້າສະລິບຖືກປະຕິເສດ, ທ່ານຈະເຫັນເຫດຜົນ ແລະ ສົ່ງສະລິບໃໝ່ໄດ້ໃນໜ້າຄຳສັ່ງຊື້.',
          facts.orders?.some((o) => o.status === 'PENDING') ? `ຄຳສັ່ງຊື້ທີ່ລໍຖ້າການຢືນຢັນ: ${facts.orders.filter((o) => o.status === 'PENDING').map((o) => o.number).join(', ')}.` : '',
          `ຖ້າດົນເກີນໄປ, ຕິດຕໍ່ທີມງານ: ${c.phoneLabel}.`,
        ]
          .filter(Boolean)
          .join(' ');
      case 'returns':
        return `ຄືນສິນຄ້າໄດ້ພາຍໃນ ${days} ມື້ ຫຼັງຈາກໄດ້ຮັບເຄື່ອງ (ເຊັ່ນ: ໄດ້ຂອງຜິດ, ເພເສຍ, ບໍ່ຕົງຕາມທີ່ບອກ): ໄປທີ່ "ຄຳສັ່ງຊື້ຂອງຂ້ອຍ" → ເລືອກຄຳສັ່ງຊື້ → "ຂໍຄືນສິນຄ້າ" ແລ້ວແນບຮູບ ຫຼື ວິດີໂອ (ແນະນຳໃຫ້ຖ່າຍວິດີໂອຕອນເປີດກ່ອງ). MC Mart ຈະກວດສອບ ແລະ ຄືນເງິນເຂົ້າບັນຊີທະນາຄານຂອງທ່ານ.`;
      case 'sell':
        return 'ເປີດຮ້ານໃນ MC Mart ໄດ້ຟຣີ! ໄປທີ່ "ບັນຊີ" → "ເປີດຮ້ານ", ໃສ່ຂໍ້ມູນຮ້ານ ແລະ ເອກະສານ, ແລ້ວລໍຖ້າທີມງານອະນຸມັດ. ຫຼັງຈາກນັ້ນເພີ່ມສິນຄ້າ ແລະ ຈັດການຄຳສັ່ງຊື້ໄດ້ໃນ "ສູນຜູ້ຂາຍ".';
      case 'howToBuy':
        return `ສັ່ງຊື້ງ່າຍໆ:\n1. ແຕະສິນຄ້າ → ເລືອກຕົວເລືອກ ແລະ ຈຳນວນ\n2. "ເພີ່ມໃສ່ກະຕ່າ" ຫຼື "ຊື້ເລີຍ"\n3. ເລືອກທີ່ຢູ່ ແລະ ການຈັດສົ່ງ\n4. ຈ່າຍດ້ວຍ ${facts.payments.join(' ຫຼື ')}\nຫຼື ບອກຂ້ອຍວ່າ "ເອົາອັນນີ້" ຂ້ອຍຈະສ້າງຄຳສັ່ງຊື້ໃນແຊັດໃຫ້.`;
      case 'contact':
        return `ຕິດຕໍ່ທີມງານ MC Mart: ໂທ ${c.phoneLabel} ຫຼື WhatsApp ${c.whatsapp}. ຄຳຖາມກ່ຽວກັບສິນຄ້າ ຫຼື ຄຳສັ່ງຊື້ໃດໜຶ່ງ, ແຊັດກັບຮ້ານໂດຍກົງໄດ້ທີ່ປຸ່ມ "ແຊັດກັບຮ້ານ".`;
      case 'points':
        return [
          'ທ່ານໄດ້ຮັບຄະແນນເມື່ອກົດ "ຂ້ອຍໄດ້ຮັບສິນຄ້າແລ້ວ" (ຈຳນວນຂຶ້ນກັບຍອດຄຳສັ່ງຊື້; ຖ້າຄຳສັ່ງຊື້ສຳເລັດເອງ ຈະບໍ່ໄດ້ຄະແນນ).',
          facts.points ? `ໃຊ້ຫຼຸດລາຄາຕອນສັ່ງຊື້: 1 ຄະແນນ = ${formatMoney(facts.points.redeemValue, 'lo')}.${facts.points.expiryDays ? ` ຄະແນນໝົດອາຍຸຫຼັງ ${facts.points.expiryDays} ມື້.` : ''}` : '',
          'ເບິ່ງຄະແນນໄດ້ໃນ "ບັນຊີ" → "ຄະແນນຂອງຂ້ອຍ".',
        ]
          .filter(Boolean)
          .join(' ');
      case 'account':
        return 'ເຂົ້າສູ່ລະບົບດ້ວຍເບີໂທ (ຮັບລະຫັດ OTP ທາງ SMS) ຫຼື ບັນຊີ Google — ບໍ່ຈຳເປັນຕ້ອງມີລະຫັດຜ່ານ. ປ່ຽນຊື່, ຮູບ ແລະ ທີ່ຢູ່ຈັດສົ່ງໄດ້ໃນ "ບັນຊີ". ຖ້າບໍ່ໄດ້ຮັບ OTP, ລໍຖ້າ 1 ນາທີແລ້ວກົດສົ່ງໃໝ່.';
      case 'hours':
        return `MC Mart ເປີດ 24 ຊົ່ວໂມງ — ສັ່ງຊື້ໄດ້ທຸກເວລາ ແລະ ຂ້ອຍຕອບໄດ້ຕະຫຼອດ. ຮ້ານແຕ່ລະຮ້ານຈະກະກຽມ ແລະ ຕອບແຊັດຕາມເວລາເຮັດວຽກຂອງຮ້ານ.`;
      case 'authentic':
        return `ຮ້ານທີ່ມີເຄື່ອງໝາຍ ✓ ແມ່ນຮ້ານທີ່ MC Mart ຢືນຢັນແລ້ວ; ກວດເບິ່ງຄະແນນ ແລະ ຣີວິວຈາກລູກຄ້າກ່ອນຊື້ໄດ້. ຖ້າໄດ້ຮັບຂອງບໍ່ຕົງຕາມທີ່ບອກ, ຂໍຄືນສິນຄ້າໄດ້ພາຍໃນ ${days} ມື້ ແລະ ຮັບເງິນຄືນ.`;
    }
  }
  switch (topic) {
    case 'bye':
      return 'Thanks for stopping by! 👋 Come back anytime.';
    case 'ack':
      return 'Okay 😊 Anything else I can help you find? Type a product or send a photo.';
    case 'about':
      return "I'm Market Chat, MC Mart's shopping assistant 🤖 I can:\n• find products by name or photo\n• compare prices, colours and sizes, and find cheaper options\n• recommend shops and best sellers\n• answer questions about delivery, payment, returns and your orders\nJust ask!";
    case 'deliveryFee':
      return "The delivery fee isn't in the product price: you pay it to the courier when your order arrives (it depends on the courier and province). Some shops deliver free nearby — pin your address on the map at checkout to see. Collecting at the shop is free.";
    case 'deliveryTime':
      return 'The shop prepares and sends your order once payment is confirmed; delivery time depends on the courier and your province. Some shops offer their own urgent delivery. You can follow it in My orders or on the Track order page.';
    case 'orders':
      if (facts.orders?.length)
        return [`Your orders in progress:`, ...facts.orders.map((o) => `• ${o.number} — ${STATUS.en[o.status] ?? o.status}${o.carrier ? ` · ${o.carrier}` : ''}${o.tracking ? ` (${o.tracking})` : ''}`), 'Open My orders for the details.'].join('\n');
      if (facts.orders) return "You don't have any orders on the way right now. Past orders are in My orders.";
      return 'Use "Track order" at the top: enter your order number and the phone number on the order. If you sign in, I can tell you its status right here.';
    case 'cancel':
      return 'An unpaid order (or one whose payment slip was rejected) can be cancelled in My orders → the order → "Cancel this order". Once it\'s paid or the shop is preparing it, chat with the shop. If you already received it, ask for a return instead.';
    case 'paymentCheck':
      return [
        'After you send your slip, MC Mart checks the transfer and passes the order to the shop as soon as it\'s confirmed. If a slip is rejected, you\'ll see why and can send a new one on the order page.',
        facts.orders?.some((o) => o.status === 'PENDING') ? `Waiting for confirmation: ${facts.orders.filter((o) => o.status === 'PENDING').map((o) => o.number).join(', ')}.` : '',
        `If it takes too long, contact the team: ${c.phoneLabel}.`,
      ]
        .filter(Boolean)
        .join(' ');
    case 'returns':
      return `You can ask for a return within ${days} days of receiving your order (wrong item, damaged, not as described): My orders → the order → "Request a return", with photos or a video (an unboxing video helps). MC Mart reviews it and refunds you to your bank account.`;
    case 'sell':
      return 'Opening a shop on MC Mart is free! Go to Account → "Open a shop", fill in your shop details and documents, and our team reviews it. Then add products and manage orders in the Seller Center.';
    case 'howToBuy':
      return `Ordering is easy:\n1. Tap a product → choose options and quantity\n2. "Add to cart" or "Buy now"\n3. Choose your address and delivery\n4. Pay by ${facts.payments.join(' or ')}\nOr tell me "I'll take it" and I'll make the order right here in the chat.`;
    case 'contact':
      return `Contact the MC Mart team: call ${c.phoneLabel} or WhatsApp ${c.whatsapp}. For a product or an order, you can also chat with the shop directly ("Chat with shop").`;
    case 'points':
      return [
        'You earn points when you tap "I received it" on an order (the amount depends on the order total; orders that complete on their own earn none).',
        facts.points ? `Use them for a discount at checkout: 1 point = ${formatMoney(facts.points.redeemValue, 'en')}.${facts.points.expiryDays ? ` Points expire after ${facts.points.expiryDays} days.` : ''}` : '',
        'See them in Account → My points.',
      ]
        .filter(Boolean)
        .join(' ');
    case 'account':
      return "Sign in with your phone number (we text you a code) or Google — no password needed. Change your name, photo and delivery addresses in Account. Didn't get the code? Wait a minute and tap resend.";
    case 'hours':
      return 'MC Mart is open 24/7 — order anytime, and I answer anytime. Each shop prepares orders and replies to chats during its own working hours.';
    case 'authentic':
      return `Shops with a ✓ are verified by MC Mart; check a shop's rating and customer reviews before buying. If what arrives isn't as described, you can ask for a return within ${days} days and get your money back.`;
  }
}

/** The same facts, for Claude's instructions (so it never invents a policy). */
export function helpFactsForModel(facts: HelpFacts): string {
  return [
    `- Payment: ${facts.payments.join(', ')}. One transfer to MC Mart pays the whole order; MC Mart checks the slip.`,
    "- Delivery: the fee is not in the price; the customer pays the courier on delivery (it depends on courier and province). Some shops deliver free nearby or offer urgent delivery; collecting at the shop is free. Delivery time depends on courier and province — never promise a number of days.",
    `- After delivery, the customer taps "I received it" (or it completes by itself after ${AUTO_COMPLETE_DAYS} days).`,
    `- Returns: within ${RETURN_RULES.windowDays} days of receiving it, in My orders → the order → "Request a return", with photos or a video; MC Mart reviews and refunds to the customer's bank account.`,
    `- Guarantees: shops may give a guarantee; customers get ${GUARANTEE_RULES.multiplier}× what the shop states, from the day the order completes.`,
    '- Tracking: "Track order" (order number + phone number on the order), or My orders when signed in.',
    `- Points: earned by tapping "I received it"${facts.points ? `; 1 point = ${facts.points.redeemValue} kip off at checkout${facts.points.expiryDays ? `, expiring after ${facts.points.expiryDays} days` : ''}` : ''}. See Account → My points.`,
    '- Selling: opening a shop is free (Account → Open a shop; the team reviews it; then the Seller Center).',
    "- Account: sign in with the phone number (SMS code) or Google; no password needed.",
    `- MC Mart contact: phone ${MC_MART_CONTACT.phoneLabel}, WhatsApp ${MC_MART_CONTACT.whatsapp}. For a product or an order, the customer can chat with the shop.`,
    "- Shops with ✓ are verified by MC Mart. MC Mart is open 24/7; shops reply during their own hours.",
    facts.orders?.length
      ? `- This customer's orders in progress: ${facts.orders.map((o) => `${o.number} (${STATUS.en[o.status] ?? o.status}${o.carrier ? `, ${o.carrier}` : ''}${o.tracking ? `, tracking ${o.tracking}` : ''})`).join('; ')}.`
      : facts.orders
        ? "- This customer has no orders in progress."
        : '- The customer is not signed in: for their order status, point them to "Track order".',
  ].join('\n');
}

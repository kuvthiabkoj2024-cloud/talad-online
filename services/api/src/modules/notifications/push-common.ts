import type { Locale } from '@talad/shared';

/** A chat message's push title, as both Web Push and phone push show it. */
export const CHAT_TITLE: Record<Locale, (name: string) => string> = {
  lo: (name) => `ຂໍ້ຄວາມໃໝ່ຈາກ ${name}`,
  en: (name) => `New message from ${name}`,
};

/** Types a customer can turn off (Profile → Notifications): promotions and price drops. */
export const PROMO_TYPES: ReadonlySet<string> = new Set(['PROMOTION', 'PRICE_DROP']);

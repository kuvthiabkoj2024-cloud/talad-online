import type { Locale } from './locale.js';

/**
 * Lao provinces keyed by ISO 3166-2:LA subdivision code. Addresses store the
 * code; names are rendered per locale.
 */
export const LAO_PROVINCES = {
  VT: { lo: 'ນະຄອນຫຼວງວຽງຈັນ', en: 'Vientiane Capital' },
  AT: { lo: 'ອັດຕະປື', en: 'Attapeu' },
  BK: { lo: 'ບໍ່ແກ້ວ', en: 'Bokeo' },
  BL: { lo: 'ບໍລິຄຳໄຊ', en: 'Bolikhamxay' },
  CH: { lo: 'ຈຳປາສັກ', en: 'Champasak' },
  HO: { lo: 'ຫົວພັນ', en: 'Houaphanh' },
  KH: { lo: 'ຄຳມ່ວນ', en: 'Khammouane' },
  LM: { lo: 'ຫຼວງນ້ຳທາ', en: 'Luang Namtha' },
  LP: { lo: 'ຫຼວງພະບາງ', en: 'Luang Prabang' },
  OU: { lo: 'ອຸດົມໄຊ', en: 'Oudomxay' },
  PH: { lo: 'ຜົ້ງສາລີ', en: 'Phongsaly' },
  SL: { lo: 'ສາລະວັນ', en: 'Salavan' },
  SV: { lo: 'ສະຫວັນນະເຂດ', en: 'Savannakhet' },
  VI: { lo: 'ແຂວງວຽງຈັນ', en: 'Vientiane Province' },
  XA: { lo: 'ໄຊຍະບູລີ', en: 'Xayaboury' },
  XE: { lo: 'ເຊກອງ', en: 'Sekong' },
  XI: { lo: 'ຊຽງຂວາງ', en: 'Xiengkhouang' },
  XS: { lo: 'ໄຊສົມບູນ', en: 'Xaisomboun' },
} as const satisfies Record<string, Record<Locale, string>>;

export type ProvinceCode = keyof typeof LAO_PROVINCES;
export const PROVINCE_CODES = Object.keys(LAO_PROVINCES) as ProvinceCode[];

/** Province name for display; unknown values (e.g. legacy free text) pass through. */
export function provinceName(code: string, locale: Locale): string {
  return code in LAO_PROVINCES ? LAO_PROVINCES[code as ProvinceCode][locale] : code;
}

export const ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

/** Banks customers can receive refunds to. */
export const LAO_BANKS = {
  BCEL: 'BCEL — Banque pour le Commerce Extérieur Lao',
  LDB: 'Lao Development Bank',
  APB: 'Agricultural Promotion Bank',
  JDB: 'Joint Development Bank',
  BFL: 'Banque Franco-Lao',
  LVB: 'Lao-Viet Bank',
  STB: 'ST Bank',
  IDCB: 'Indochina Bank',
  PSVB: 'Phongsavanh Bank',
  ACLEDA: 'ACLEDA Bank Lao',
  MJBL: 'Maruhan Japan Bank Lao',
  VTB: 'Vietin Bank Lao',
  OTHER: 'Other',
} as const;
export type BankCode = keyof typeof LAO_BANKS;
export const BANK_CODES = Object.keys(LAO_BANKS) as BankCode[];

export const CUSTOMER_LIMITS = {
  maxAddresses: 10,
  maxBankAccounts: 5,
  qrMaxBytes: 2 * 1024 * 1024,
  qrMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
} as const;

/** Account numbers: digits only after stripping spaces/dashes, 6–20 long. */
export function normalizeAccountNumber(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{6,20}$/.test(digits) ? digits : null;
}

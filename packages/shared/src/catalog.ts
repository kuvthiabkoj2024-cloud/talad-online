/** Product listing status (scope §2.5). */
export const PRODUCT_STATUSES = [
  'DRAFT',
  'PENDING',
  'PUBLISHED',
  'REJECTED',
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

/** Shop onboarding status (scope §2.3). */
export const SHOP_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const;
export type ShopStatus = (typeof SHOP_STATUSES)[number];

/** Upload limits enforced by both clients and the API. */
export const MEDIA_LIMITS = {
  maxImagesPerProduct: 10,
  maxImageBytes: 5 * 1024 * 1024,
  /** A minute of 1080p phone video is typically 60–150 MB. */
  maxVideoBytes: 200 * 1024 * 1024,
  maxVideoSeconds: 60,
  imageMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  videoMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'],
} as const;

/** Seller-side product rules, checked by both the Seller Center and the API (§3.3). */
export const PRODUCT_RULES = {
  nameMax: 200,
  descriptionMax: 5000,
  skuPattern: /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/,
  maxVariants: 50,
  maxPrice: 1_000_000_000,
  maxStock: 1_000_000,
} as const;

/** Shop coupon rules (§3.4). Codes are stored upper-case. */
export const COUPON_RULES = {
  codePattern: /^[A-Z0-9]{3,20}$/,
  maxPercent: 90,
} as const;

/** What a seller asks for when saving: keep as draft, or put it on sale (moderation may hold it as PENDING). */
export const PRODUCT_SAVE_INTENTS = ['draft', 'publish'] as const;
export type ProductSaveIntent = (typeof PRODUCT_SAVE_INTENTS)[number];

/** Shop registration (§3.1, §2.3). */
export const KYC_DOCUMENT_TYPES = ['NATIONAL_ID', 'BUSINESS_LICENSE', 'TAX_CERTIFICATE', 'OTHER'] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

export const SHOP_RULES = {
  nameMin: 2,
  nameMax: 80,
  /** Storefront address: taladonline.com/s/<slug>. */
  slugPattern: /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/,
  descriptionMax: 1000,
  addressMax: 300,
  kycMaxBytes: 5 * 1024 * 1024,
  kycMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  maxKycDocuments: 6,
} as const;

/** "Bolaven Coffee & Co." → "bolaven-coffee-co"; Lao-only names give "" (ask the seller). */
export function slugify(text: string, max = 40): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/** Flash sales (§3.4): a percentage off chosen products for a short window. */
export const FLASH_SALE_RULES = {
  minPercent: 5,
  maxPercent: 90,
  maxItems: 50,
  maxDays: 14,
  nameMax: 60,
} as const;

/** Shop profile (§3.2). */
export const SHOP_PROFILE_RULES = {
  imageMaxBytes: 5 * 1024 * 1024,
  /** Order deadline policy (§3.6), in hours. */
  paymentWindowHrs: { min: 1, max: 72 },
  autoConfirmHrs: { min: 24, max: 336 },
} as const;

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
/** Opening hours per day ("08:00"–"18:00"); a missing day is closed. */
export type BusinessHours = Partial<Record<Weekday, { open: string; close: string }>>;

export const SOCIAL_LINKS = ['facebook', 'tiktok', 'whatsapp', 'line', 'instagram', 'website'] as const;
export type SocialLink = (typeof SOCIAL_LINKS)[number];

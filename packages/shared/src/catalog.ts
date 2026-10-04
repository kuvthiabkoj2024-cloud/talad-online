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
  maxVideoBytes: 50 * 1024 * 1024,
  maxVideoSeconds: 60,
  imageMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
  videoMimeTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
} as const;

/**
 * Object layout in the Bunny storage zone. `c-` folders belong to a customer
 * account, `s-` folders to a shop (keyed by shop id, so they survive an owner change):
 *
 *   c-<customerId>/profile/   avatar-<uuid>.<ext>
 *   c-<customerId>/payments/  slip-<uuid>.<ext>, refund-qr-<uuid>.<ext>
 *   c-<customerId>/kyc/       kyc-<uuid>.<ext> (shop application documents; private)
 *   c-<customerId>/videos/    video-<uuid>.<ext> (the customer's own feed videos; public)
 *   s-<shopId>/profile/       payment-qr-<uuid>.<ext> (logo, cover)
 *   s-<shopId>/products/      image-<uuid>.<ext>, video-<uuid>.<ext>
 *   s-<shopId>/orders/        bill-<uuid>.<ext> (courier bills photographed when shipping; private)
 *   p-<zero uuid>/media/      image-<uuid>.<ext> (platform banners, category icons; public)
 *   m-<conversationId>/photos/ photo-<uuid>.<ext> (customer ↔ shop chat photos; private)
 */
export const storageFolder = {
  customerProfile: (customerId: string) => `c-${customerId}/profile/`,
  customerPayments: (customerId: string) => `c-${customerId}/payments/`,
  customerKyc: (customerId: string) => `c-${customerId}/kyc/`,
  /** Videos the customer posts to the feed (public, like product videos). */
  customerVideos: (customerId: string) => `c-${customerId}/videos/`,
  shopProfile: (shopId: string) => `s-${shopId}/profile/`,
  shopProducts: (shopId: string) => `s-${shopId}/products/`,
  /** Courier bills uploaded when shipping (served to the shop and that order's customer). */
  shopOrders: (shopId: string) => `s-${shopId}/orders/`,
  /** Platform-owned public media uploaded in the admin console. */
  platformMedia: () => 'p-00000000-0000-0000-0000-000000000000/media/',
  /** Photos in one customer ↔ shop conversation (served only to its two sides). */
  conversation: (conversationId: string) => `m-${conversationId}/photos/`,
};

/**
 * Key prefix for one kind of file, e.g. `c-<id>/payments/slip-`; uploads append a fresh
 * `randomUUID()` + extension, so keys are unique and nothing is overwritten. Also used
 * to check that a key a client sends back really is that customer's file of that kind.
 */
export const filePrefix = (folder: string, label: string) => `${folder}${label}-`;

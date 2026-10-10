/**
 * Object layout in the Bunny storage zone. `c-` folders belong to a customer
 * account, `s-` folders to a shop (keyed by shop id, so they survive an owner change):
 *
 *   c-<customerId>/profile/   avatar-<uuid>.<ext>
 *   c-<customerId>/payments/  slip-<uuid>.<ext>, refund-qr-<uuid>.<ext>
 *   c-<customerId>/kyc/       kyc-<uuid>.<ext> (shop application documents; private)
 *   s-<shopId>/profile/       payment-qr-<uuid>.<ext> (logo, cover)
 *   s-<shopId>/products/      image-<uuid>.<ext>, video-<uuid>.<ext>
 *   p-<zero uuid>/media/      image-<uuid>.<ext> (platform banners, category icons; public)
 */
export const storageFolder = {
  customerProfile: (customerId: string) => `c-${customerId}/profile/`,
  customerPayments: (customerId: string) => `c-${customerId}/payments/`,
  customerKyc: (customerId: string) => `c-${customerId}/kyc/`,
  shopProfile: (shopId: string) => `s-${shopId}/profile/`,
  shopProducts: (shopId: string) => `s-${shopId}/products/`,
  /** Platform-owned public media uploaded in the admin console. */
  platformMedia: () => 'p-00000000-0000-0000-0000-000000000000/media/',
};

/**
 * Key prefix for one kind of file, e.g. `c-<id>/payments/slip-`; uploads append a fresh
 * `randomUUID()` + extension, so keys are unique and nothing is overwritten. Also used
 * to check that a key a client sends back really is that customer's file of that kind.
 */
export const filePrefix = (folder: string, label: string) => `${folder}${label}-`;

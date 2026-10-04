/**
 * Object layout in the Bunny storage zone. `c-` folders belong to a customer
 * account, `s-` folders to a shop (keyed by shop id, so they survive an owner change):
 *
 *   c-<customerId>/profile/   avatar-<uuid>.<ext>
 *   c-<customerId>/payments/  slip-<uuid>.<ext>, refund-qr-<uuid>.<ext>
 *   s-<shopId>/profile/       payment-qr-<uuid>.<ext> (logo, cover)
 *   s-<shopId>/products/      <uuid>.<ext>
 */
export const storageFolder = {
  customerProfile: (customerId: string) => `c-${customerId}/profile/`,
  customerPayments: (customerId: string) => `c-${customerId}/payments/`,
  shopProfile: (shopId: string) => `s-${shopId}/profile/`,
  shopProducts: (shopId: string) => `s-${shopId}/products/`,
};

/**
 * Key prefix for one kind of file, e.g. `c-<id>/payments/slip-`; uploads append a fresh
 * `randomUUID()` + extension, so keys are unique and nothing is overwritten. Also used
 * to check that a key a client sends back really is that customer's file of that kind.
 */
export const filePrefix = (folder: string, label: string) => `${folder}${label}-`;

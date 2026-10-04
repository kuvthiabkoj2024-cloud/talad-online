/**
 * Remote hosts whose images go through the Next.js image optimizer (resized + WebP/AVIF).
 * Shared by next.config.ts and <ProductImage>; anything else is served as-is.
 * NEXT_PUBLIC_ so the client bundle sees the same list as the server.
 */
export const OPTIMIZED_IMAGE_HOSTS = [
  "upload.wikimedia.org",
  "thumb.wikimedia.org",
  // Bunny pull zone serving shop logos and product photos, e.g. talad-online.b-cdn.net
  ...(process.env.NEXT_PUBLIC_MEDIA_HOST ? [process.env.NEXT_PUBLIC_MEDIA_HOST] : []),
];

import type { NextConfig } from "next";
import { OPTIMIZED_IMAGE_HOSTS } from "./src/lib/image-hosts";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // `pnpm dev` blocks dev scripts for hosts other than localhost; allow phones on the
  // local network (e.g. http://192.168.x.x:3000) so pages hydrate there. Dev only.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  images: {
    remotePatterns: OPTIMIZED_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname })),
    formats: ["image/avif", "image/webp"],
    // Card thumbnails top out around 300 px; keep the generated widths small.
    deviceSizes: [640, 828, 1080, 1200, 1920],
    imageSizes: [64, 96, 128, 256, 384],
    // Catalog photos rarely change; cache optimized variants for a day.
    minimumCacheTTL: 86400,
  },
  // The service worker must never be served from a stale HTTP cache, or updates stall.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Bank QR uploads go through a Server Action: 2 MB image + multipart overhead.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;

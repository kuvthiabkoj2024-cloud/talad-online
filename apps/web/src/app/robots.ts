import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Pages that are only for the signed-in visitor (they also say noindex). */
const PRIVATE = ["account", "cart", "checkout", "messages", "notifications", "login", "register", "guarantee", "feed/new"];

/** /robots.txt: crawl the shop, not people's accounts; share-preview pictures stay open. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/og", "/api/avatars/"],
        disallow: ["/api/", ...PRIVATE.map((p) => `/*/${p}`)],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}

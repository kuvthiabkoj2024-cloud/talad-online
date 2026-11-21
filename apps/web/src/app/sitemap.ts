import { DEFAULT_LOCALE, LOCALES } from "@talad/shared";
import type { MetadataRoute } from "next";
import { apiGet } from "@/lib/api";
import { SITE_URL } from "@/lib/seo";

/** Mirrors `SitemapEntries` from services/api catalog/sitemap. */
interface SitemapEntries {
  products: { shop: string; slug: string; updatedAt: string }[];
  shops: { slug: string; updatedAt: string }[];
  categories: { slug: string; updatedAt: string }[];
  pages: { slug: string; updatedAt: string }[];
}

// Rebuilt at most hourly; new products reach Google on its next visit.
export const revalidate = 3600;

type Entry = MetadataRoute.Sitemap[number];

/** One page in every language, each listing the others (hreflang), as Google asks. */
function page(path: string, extra: Omit<Entry, "url" | "alternates"> = {}): Entry[] {
  const languages = Object.fromEntries([...LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]), ["x-default", `${SITE_URL}/${DEFAULT_LOCALE}${path}`]]);
  return LOCALES.map((l) => ({ url: `${SITE_URL}/${l}${path}`, alternates: { languages }, ...extra }));
}

/** /sitemap.xml: the home page, categories, shops, products and information pages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const data = await apiGet<SitemapEntries>("/sitemap");
  const date = (s: string) => new Date(s);
  return [
    ...page("", { changeFrequency: "daily", priority: 1 }),
    ...page("/feed", { changeFrequency: "hourly", priority: 0.6 }),
    ...page("/c", { changeFrequency: "weekly", priority: 0.5 }),
    ...(data?.categories ?? []).flatMap((c) => page(`/c/${c.slug}`, { lastModified: date(c.updatedAt), changeFrequency: "daily", priority: 0.7 })),
    ...(data?.shops ?? []).flatMap((s) => page(`/s/${s.slug}`, { lastModified: date(s.updatedAt), changeFrequency: "daily", priority: 0.7 })),
    ...(data?.products ?? []).flatMap((p) => page(`/p/${p.shop}/${p.slug}`, { lastModified: date(p.updatedAt), changeFrequency: "weekly", priority: 0.8 })),
    ...(data?.pages ?? []).flatMap((p) => page(`/pages/${p.slug}`, { lastModified: date(p.updatedAt), changeFrequency: "monthly", priority: 0.3 })),
  ];
}

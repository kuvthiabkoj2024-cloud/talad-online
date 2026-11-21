import { DEFAULT_LOCALE, LOCALES, type Locale } from "@talad/shared";
import type { Metadata } from "next";

/** The storefront's public address (share links and sitemaps need absolute URLs). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const SITE_NAME = "MC Mart";

/** Link-preview picture size (Facebook, Messenger, WhatsApp, X, LINE all use 1.91:1). */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** The picture shown when a page has no photo of its own. */
export const DEFAULT_OG_IMAGE = { url: "/og-default.jpg", width: OG_WIDTH, height: OG_HEIGHT, alt: SITE_NAME };

const OG_LOCALES: Record<Locale, string> = { lo: "lo_LA", en: "en_US" };

/** What every page is also about. */
const SITE_KEYWORDS: Record<Locale, string> = { lo: "ຊື້ເຄື່ອງອອນລາຍ ລາວ", en: "online shopping Laos" };

/**
 * A page's links to itself: the canonical URL and the same page in each language (hreflang),
 * with Lao as the default for everyone else. `path` is without the language, e.g. "/s/my-shop".
 */
export function pageAlternates(lang: Locale, path = ""): NonNullable<Metadata["alternates"]> {
  return {
    canonical: `/${lang}${path}`,
    languages: {
      ...Object.fromEntries(LOCALES.map((l) => [l, `/${l}${path}`])),
      "x-default": `/${DEFAULT_LOCALE}${path}`,
    },
  };
}

/** A photo as a small 1200×630 preview picture (see /api/og); the default picture without one. */
export function ogImage(src: string | null | undefined, alt: string) {
  if (!src) return { ...DEFAULT_OG_IMAGE, alt };
  return { url: `/api/og?src=${encodeURIComponent(src)}`, width: OG_WIDTH, height: OG_HEIGHT, type: "image/jpeg", alt };
}

interface ShareInput {
  lang: Locale;
  /** Without the language, e.g. "/p/shop/slug". */
  path: string;
  title: string;
  description: string;
  image?: string | null;
  type?: "website" | "profile" | "video.other";
  /** Words this page is about (name, brand, category…); the site's own are added. */
  keywords?: (string | null | undefined)[];
}

/** Everything a shared link needs: title, description, picture and URL, for Open Graph and X. */
export function shareMetadata({ lang, path, title, description, image, type = "website", keywords }: ShareInput): Metadata {
  const picture = ogImage(image, title);
  return {
    title,
    description,
    ...(keywords && { keywords: [...new Set([...keywords.filter((k): k is string => !!k), SITE_NAME, SITE_KEYWORDS[lang]])] }),
    alternates: pageAlternates(lang, path),
    openGraph: {
      type,
      siteName: SITE_NAME,
      locale: OG_LOCALES[lang],
      alternateLocale: LOCALES.filter((l) => l !== lang).map((l) => OG_LOCALES[l]),
      url: `/${lang}${path}`,
      title,
      description,
      images: [picture],
    },
    twitter: { card: "summary_large_image", title, description, images: [picture.url] },
  };
}

/** Plain text for a meta description: no line breaks or runs of spaces, at most ~160 characters. */
export function metaDescription(...parts: (string | null | undefined)[]): string {
  const text = parts.filter(Boolean).join(" · ").replace(/\s+/g, " ").trim();
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export { OG_LOCALES };

import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_Lao_Looped } from "next/font/google";
import { LOCALES } from "@talad/shared";
import { SessionProvider } from "@/components/auth/session-provider";
import { LiveUpdates } from "@/components/realtime/live-updates";
import { PwaBridge } from "@/components/realtime/pwa-bridge";
import { DEFAULT_OG_IMAGE, OG_LOCALES, SITE_NAME, SITE_URL } from "@/lib/seo";
import { getDictionary, getLocale } from "./dictionaries";
import "../globals.css";

// One font for everything, Lao and English.
const font = Noto_Sans_Lao_Looped({ variable: "--font-main", subsets: ["lao", "latin"] });

/** Google Analytics 4 measurement ID (G-…), baked in at build time. */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getDictionary();
  const locale = await getLocale();
  const verification = process.env.GOOGLE_SITE_VERIFICATION;
  return {
    // Share previews need absolute links (og:url, og:image).
    metadataBase: new URL(SITE_URL),
    title: { default: meta.title, template: `%s · ${SITE_NAME}` },
    description: meta.description,
    keywords: meta.keywords,
    applicationName: SITE_NAME,
    authors: [{ name: SITE_NAME, url: SITE_URL }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "shopping",
    // Pages set their own canonical and language links (pageAlternates); private pages opt out.
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    },
    // What a shared link shows when the page sets nothing itself: the MC Mart picture.
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: OG_LOCALES[locale],
      title: meta.title,
      description: meta.description,
      images: [DEFAULT_OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: meta.title, description: meta.description, images: [DEFAULT_OG_IMAGE.url] },
    // Phone numbers in product text aren't links on iOS.
    formatDetection: { telephone: false },
    ...(verification && { verification: { google: verification } }),
    // Installed-app look on iOS (Android/desktop read app/manifest.ts).
    appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: "default" },
    icons: {
      icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#2e7d32",
  width: "device-width",
  initialScale: 1,
  // iPhones zoom in when a text box under 16px is tapped (chat, search) and stay zoomed;
  // this stops that (pinch zoom still works on iOS), as in the Seller Center.
  maximumScale: 1,
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const locale = await getLocale();
  const { live } = await getDictionary();

  return (
    <html
      lang={locale}
      className={`${font.variable} h-full antialiased`}
    >
      {/* Phones: reserve space so a fixed bottom bar (cart, checkout) never covers the footer. */}
      <body className="flex min-h-full flex-col max-lg:has-[[data-bottom-bar]]:pb-24">
        {/* Header/footer come from the (store) and checkout layouts. */}
        <SessionProvider>
          {children}
          {/* Signed-in customers: order updates and shop replies arrive live, with a chime. */}
          <LiveUpdates locale={locale} dict={live} />
          {/* The installed app: icon badge, and opening what a tapped push is about. */}
          <PwaBridge />
        </SessionProvider>
      </body>
      {/* Google Analytics 4 (visits, pages, where visitors come from); off until an ID is set. */}
      {GA_ID && <GoogleAnalytics gaId={GA_ID} />}
    </html>
  );
}

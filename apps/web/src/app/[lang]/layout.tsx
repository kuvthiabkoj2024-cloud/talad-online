import type { Metadata, Viewport } from "next";
import { Noto_Sans_Lao_Looped } from "next/font/google";
import { LOCALES } from "@talad/shared";
import { SessionProvider } from "@/components/auth/session-provider";
import { LiveUpdates } from "@/components/realtime/live-updates";
import { PwaBridge } from "@/components/realtime/pwa-bridge";
import { getDictionary, getLocale } from "./dictionaries";
import "../globals.css";

// One font for everything, Lao and English.
const font = Noto_Sans_Lao_Looped({ variable: "--font-main", subsets: ["lao", "latin"] });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getDictionary();
  return {
    // Share previews need absolute links (og:url, og:image).
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: { default: meta.title, template: `%s · MC Mart` },
    description: meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    // Installed-app look on iOS (Android/desktop read app/manifest.ts).
    appleWebApp: { capable: true, title: "MC Mart", statusBarStyle: "default" },
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
    </html>
  );
}

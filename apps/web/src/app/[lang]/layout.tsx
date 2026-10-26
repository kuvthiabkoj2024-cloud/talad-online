import type { Metadata, Viewport } from "next";
import { Noto_Sans_Lao_Looped } from "next/font/google";
import { LOCALES } from "@talad/shared";
import { SessionProvider } from "@/components/auth/session-provider";
import { LiveUpdates } from "@/components/realtime/live-updates";
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
    title: { default: meta.title, template: `%s · Taladonline` },
    description: meta.description,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    // Installed-app look on iOS (Android/desktop read app/manifest.ts).
    appleWebApp: { capable: true, title: "Taladonline", statusBarStyle: "default" },
    icons: {
      icon: [
        { url: "/icons/icon.svg", type: "image/svg+xml" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      ],
      apple: "/icons/apple-touch-icon.png",
    },
  };
}

export const viewport: Viewport = {
  themeColor: "#2e7d32",
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
        </SessionProvider>
      </body>
    </html>
  );
}

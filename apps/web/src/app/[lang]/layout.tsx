import type { Metadata, Viewport } from "next";
import { Geist, Noto_Sans_Lao } from "next/font/google";
import { LOCALES } from "@talad/shared";
import { SessionProvider } from "@/components/auth/session-provider";
import { getDictionary, getLocale } from "./dictionaries";
import "../globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const lao = Noto_Sans_Lao({ variable: "--font-lao", subsets: ["lao"] });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { meta } = await getDictionary();
  return {
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

  return (
    <html
      lang={locale}
      className={`${geist.variable} ${lao.variable} h-full antialiased`}
    >
      {/* Phones: reserve space so a fixed bottom bar (cart, checkout) never covers the footer. */}
      <body className="flex min-h-full flex-col max-lg:has-[[data-bottom-bar]]:pb-24">
        {/* Header/footer come from the (store) and checkout layouts. */}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

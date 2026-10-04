import { PAYMENT_METHODS, type Locale } from "@talad/shared";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";

const PAYMENT_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  COD: "COD",
  BANK_TRANSFER: "Bank transfer",
  BCEL_ONE: "BCEL One",
  LAPNET: "LAPNet",
  U_MONEY: "U-Money",
  CARD: "Visa / Mastercard",
};

export function SiteFooter({
  locale,
  dict,
}: {
  locale: Locale;
  dict: Dictionary["footer"];
}) {
  const links = [
    ["about", dict.about],
    ["terms", dict.terms],
    ["privacy", dict.privacy],
    ["faq", dict.faq],
  ] as const;

  return (
    <footer className="mt-16 bg-primary text-sm text-primary-foreground">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="mb-3 text-lg font-bold">Taladonline</p>
          <ul className="space-y-2">
            {links.map(([slug, label]) => (
              <li key={slug}>
                <Link href={`/${locale}/pages/${slug}`} className="hover:underline">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 font-semibold">{dict.help}</p>
          <ul className="space-y-2">
            <li>
              <a href={process.env.NEXT_PUBLIC_SHOP_URL ?? "#"} className="hover:underline">
                {dict.sell}
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-semibold">{dict.payments}</p>
          <ul className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <li key={m} className="rounded border border-white/40 bg-white/10 px-2 py-1 text-xs">
                {PAYMENT_LABELS[m]}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-3 font-semibold">{dict.follow}</p>
          <p className="text-primary-foreground/80">Facebook · TikTok · WhatsApp · YouTube</p>
          <p className="mt-4 mb-2 font-semibold">{dict.getApp}</p>
          <p className="text-primary-foreground/80">App Store · Google Play</p>
        </div>
      </div>
      <p className="border-t border-white/20 py-4 text-center text-primary-foreground/80">
        © {new Date().getFullYear()} Taladonline. {dict.rights}
      </p>
    </footer>
  );
}

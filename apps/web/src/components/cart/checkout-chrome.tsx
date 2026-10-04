import type { Locale } from "@talad/shared";
import { LockKeyhole, Store } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { LanguageSwitcher } from "../language-switcher";

/** Slim checkout header: logo, "Secure checkout" badge, language. */
export function CheckoutHeader({
  locale,
  secureLabel,
  languageLabel,
}: {
  locale: Locale;
  secureLabel: string;
  languageLabel: string;
}) {
  return (
    <header className="bg-primary text-primary-foreground shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:py-4">
        <Link href={`/${locale}`} className="flex shrink-0 items-center gap-1.5 text-xl font-bold tracking-tight sm:text-2xl">
          <Store className="size-7" strokeWidth={2.25} />
          Taladonline
        </Link>
        <span aria-hidden className="hidden h-6 w-px bg-white/30 sm:block" />
        <span className="hidden items-center gap-1.5 text-sm font-medium text-primary-foreground/90 sm:flex">
          <LockKeyhole className="size-4" />
          {secureLabel}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <span className="flex items-center rounded-full bg-white/15 p-2 sm:hidden" title={secureLabel}>
            <LockKeyhole aria-label={secureLabel} className="size-4" />
          </span>
          <LanguageSwitcher locale={locale} label={languageLabel} />
        </div>
      </div>
    </header>
  );
}

/** One-line footer with the policies a buyer may want before paying. */
export function CheckoutFooter({ locale, dict }: { locale: Locale; dict: Dictionary["footer"] }) {
  const links = [
    ["terms", dict.terms],
    ["privacy", dict.privacy],
    ["faq", dict.faq],
  ] as const;
  return (
    <footer className="mt-8 border-t border-border py-5 text-xs text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 sm:justify-between">
        <p>© {new Date().getFullYear()} Taladonline</p>
        <nav className="flex gap-4">
          {links.map(([slug, label]) => (
            <Link key={slug} href={`/${locale}/pages/${slug}`} className="hover:text-foreground hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

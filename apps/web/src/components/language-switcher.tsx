"use client";

import { LOCALES, type Locale } from "@talad/shared";
import { Globe } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

const LABELS: Record<Locale, string> = { lo: "ລາວ", en: "EN" };
const NAMES: Record<Locale, string> = { lo: "ລາວ", en: "English" };

/** Switches the site's language and stays on the same page (query included). */
function useSwitchLocale() {
  const router = useRouter();
  const pathname = usePathname();
  return (next: Locale) => {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    // Keep the query (checkout items, search, order tab) so the page stays the same.
    router.push(pathname.replace(/^\/[^/]+/, `/${next}`) + window.location.search);
  };
}

/** The header's compact language select (phones, and computers before signing in). */
export function LanguageSwitcher({
  locale,
  label,
  className = "",
}: {
  locale: Locale;
  label: string;
  className?: string;
}) {
  const change = useSwitchLocale();
  return (
    <select
      aria-label={label}
      value={locale}
      onChange={(e) => change(e.target.value as Locale)}
      className={`h-9 cursor-pointer rounded-full border border-white/60 bg-transparent px-2 text-sm font-medium text-primary-foreground hover:bg-white/15 ${className}`}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l} className="text-foreground">
          {LABELS[l]}
        </option>
      ))}
    </select>
  );
}

/** The language as a row of choices, inside the profile menu. */
export function LanguageChoice({ locale, label }: { locale: Locale; label: string }) {
  const change = useSwitchLocale();
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Globe className="size-5 text-muted-foreground" />
      <span className="flex-1 text-sm">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex rounded-full bg-muted p-0.5">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={l === locale}
            onClick={() => l !== locale && change(l)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              l === locale ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {NAMES[l]}
          </button>
        ))}
      </div>
    </div>
  );
}

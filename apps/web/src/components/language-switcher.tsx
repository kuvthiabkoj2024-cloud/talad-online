"use client";

import { LOCALES, type Locale } from "@talad/shared";
import { usePathname, useRouter } from "next/navigation";

const LABELS: Record<Locale, string> = { lo: "ລາວ", en: "EN" };

export function LanguageSwitcher({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function change(next: Locale) {
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; samesite=lax`;
    // Keep the query (checkout items, search, order tab) so the page stays the same.
    router.push(pathname.replace(/^\/[^/]+/, `/${next}`) + window.location.search);
  }

  return (
    <select
      aria-label={label}
      value={locale}
      onChange={(e) => change(e.target.value as Locale)}
      className="h-9 cursor-pointer rounded-full border border-white/60 bg-transparent px-2 text-sm font-medium text-primary-foreground hover:bg-white/15"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l} className="text-foreground">
          {LABELS[l]}
        </option>
      ))}
    </select>
  );
}

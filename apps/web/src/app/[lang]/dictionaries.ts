import { LOCALES, type Locale } from "@talad/shared";
import { notFound } from "next/navigation";
import { lang } from "next/root-params";

const dictionaries = {
  lo: () => import("./dictionaries/lo.json").then((m) => m.default),
  en: () => import("./dictionaries/en.json").then((m) => m.default),
} satisfies Record<Locale, unknown>;

export type Dictionary = Awaited<ReturnType<(typeof dictionaries)["en"]>>;

export const hasLocale = (locale: string): locale is Locale =>
  (LOCALES as readonly string[]).includes(locale);

/** Current locale from the `[lang]` root segment; 404s on unknown locales. */
export async function getLocale(): Promise<Locale> {
  const locale = await lang();
  if (!hasLocale(locale)) notFound();
  return locale;
}

export async function getDictionary(): Promise<Dictionary> {
  return dictionaries[await getLocale()]();
}

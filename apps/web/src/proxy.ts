import { match } from "@formatjs/intl-localematcher";
import { DEFAULT_LOCALE, LOCALES } from "@talad/shared";
import Negotiator from "negotiator";
import { NextResponse, type NextRequest } from "next/server";

export const LOCALE_COOKIE = "NEXT_LOCALE";

function getLocale(request: NextRequest): string {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (saved && (LOCALES as readonly string[]).includes(saved)) return saved;

  const languages = new Negotiator({
    headers: { "accept-language": request.headers.get("accept-language") ?? "" },
  }).languages();
  try {
    return match(languages, [...LOCALES], DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}

/** Locales the site no longer serves; their links redirect to the same page in a current one. */
const RETIRED_LOCALES = ["th"];

/** Redirects locale-less paths (e.g. /products) to /<locale>/products. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const retired = RETIRED_LOCALES.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
  if (retired) {
    request.nextUrl.pathname = `/${getLocale(request)}${pathname.slice(retired.length + 1)}`;
    return NextResponse.redirect(request.nextUrl);
  }
  const hasLocale = LOCALES.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return;

  request.nextUrl.pathname = `/${getLocale(request)}${pathname}`;
  return NextResponse.redirect(request.nextUrl);
}

export const config = {
  // Skip Next internals, API routes and any file with an extension.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};

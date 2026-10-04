import type { Locale } from "@talad/shared";
import { Bell, ScanBarcode, Search, Store } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { AccountMenu } from "./auth/account-menu";
import { CartButton } from "./cart/cart-button";
import { HeaderHeightVar, HideOnFocusRoutes } from "./focus-routes";
import { LanguageSwitcher } from "./language-switcher";

const iconButton =
  "relative rounded-full p-2 text-primary-foreground transition-colors hover:bg-white/15";

export function SiteHeader({
  locale,
  dict,
  accountDict,
}: {
  locale: Locale;
  dict: Dictionary["header"];
  accountDict: Pick<Dictionary, "auth" | "account">;
}) {
  return (
    <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 md:flex-nowrap md:py-5">
        <Link
          href={`/${locale}`}
          className="flex shrink-0 items-center gap-1.5 text-xl font-bold tracking-tight sm:gap-2 sm:text-2xl md:text-3xl"
        >
          <Store className="size-7 sm:size-8 md:size-9" strokeWidth={2.25} />
          Taladonline
        </Link>

        {/* Hidden on focus pages (cart, order history): see focus-routes.tsx. */}
        <HideOnFocusRoutes>
          <form
            action={`/${locale}/search`}
            role="search"
            className="order-last flex h-11 w-full items-center rounded-full bg-card pl-5 pr-1.5 text-foreground md:order-none md:mx-auto md:max-w-xl md:flex-1"
          >
            <input
              type="search"
              name="q"
              placeholder={dict.search}
              aria-label={dict.search}
              className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Link
              href={`/${locale}/scan`}
              aria-label={dict.scan}
              title={dict.scan}
              className="rounded-full p-2 text-muted-foreground hover:text-foreground"
            >
              <ScanBarcode className="size-5" />
            </Link>
            <button
              type="submit"
              aria-label={dict.search}
              className="rounded-full p-2 text-primary hover:bg-muted"
            >
              <Search className="size-5" strokeWidth={2.5} />
            </button>
          </form>
        </HideOnFocusRoutes>

        <nav className="ml-auto flex items-center gap-1 md:gap-2">
          <CartButton href={`/${locale}/cart`} label={dict.cart} className={iconButton} />
          <Link
            href={`/${locale}/notifications`}
            aria-label={dict.notifications}
            className={`${iconButton} hidden sm:block`}
          >
            <Bell className="size-6" />
          </Link>
          <LanguageSwitcher locale={locale} label={dict.language} />
          <AccountMenu locale={locale} dict={accountDict} />
        </nav>
      </div>
      <HeaderHeightVar />
    </header>
  );
}

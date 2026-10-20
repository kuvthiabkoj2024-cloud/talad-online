import type { Locale } from "@talad/shared";
import { MessageCircleMore, ScanLine, Search, Store } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { AccountMenu } from "./auth/account-menu";
import { CartButton } from "./cart/cart-button";
import { HeaderHeightVar, HideOnFocusRoutes } from "./focus-routes";
import { LanguageSwitcher } from "./language-switcher";
import { NotificationBell } from "./notification-bell";
import { ScrollAwayRow } from "./scroll-away-row";

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
  const search = (className: string) => (
    <form
      action={`/${locale}/search`}
      role="search"
      className={`flex h-11 items-center rounded-full bg-card pl-5 pr-1.5 text-foreground ${className}`}
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
        <ScanLine className="size-5" />
      </Link>
      <button
        type="submit"
        aria-label={dict.search}
        className="rounded-full p-2 text-primary hover:bg-muted"
      >
        <Search className="size-5" strokeWidth={2.5} />
      </button>
    </form>
  );

  return (
    // Transparent and click-through itself: when the phone search row slides away, the
    // page shows (and stays tappable) where it was.
    <header className="group/header pointer-events-none sticky top-0 z-40 text-primary-foreground">
      {/* Phones with the search row: its shadow edges the header, so none here (no line between rows). */}
      <div className="pointer-events-auto relative z-10 bg-primary shadow-sm max-md:group-has-[[data-search-row]]/header:shadow-none">
        <div className="mx-auto flex max-w-7xl items-center gap-x-6 px-4 py-3 md:py-5">
          <Link
            href={`/${locale}`}
            className="flex shrink-0 items-center gap-1.5 text-xl font-bold tracking-tight sm:gap-2 sm:text-2xl md:text-3xl"
          >
            <Store className="size-7 sm:size-8 md:size-9" strokeWidth={2.25} />
            Taladonline
          </Link>

          {/* Hidden on focus pages (cart, order history): see focus-routes.tsx. */}
          <HideOnFocusRoutes>{search("hidden md:mx-auto md:flex md:max-w-xl md:flex-1")}</HideOnFocusRoutes>

          {/* Phones: cart and account live in the bottom tab bar (bottom-nav.tsx). */}
          <nav className="ml-auto flex items-center gap-1 md:gap-2">
            <Link href={`/${locale}/chat`} aria-label={dict.chat} title={dict.chat} className={`${iconButton} hidden md:block`}>
              <MessageCircleMore className="size-6" />
            </Link>
            <CartButton href={`/${locale}/cart`} label={dict.cart} className={`${iconButton} hidden md:block`} />
            <LanguageSwitcher locale={locale} label={dict.language} />
            <NotificationBell
              href={`/${locale}/notifications`}
              label={dict.notifications}
              unreadLabel={dict.notificationsUnread}
              className={iconButton}
            />
            <div className="hidden md:block">
              <AccountMenu locale={locale} dict={accountDict} />
            </div>
          </nav>
        </div>
      </div>

      {/* Phones: search gets its own row, which slides away while scrolling down. */}
      <HideOnFocusRoutes>
        <ScrollAwayRow className="bg-primary px-4 pb-3 shadow-sm md:hidden" data-search-row>{search("w-full")}</ScrollAwayRow>
      </HideOnFocusRoutes>
      <HeaderHeightVar />
    </header>
  );
}

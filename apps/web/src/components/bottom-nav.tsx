"use client";

import type { Locale } from "@talad/shared";
import { CircleUser, Clapperboard, House, MessageCircleMore, ShoppingCart, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { Avatar } from "./auth/account-menu";
import { useSession } from "./auth/session-provider";

/** Pages with their own bar pinned to the bottom (product: add to cart / buy now; chat composer) skip the tab bar. */
const HIDDEN_ON = [/^\/p\//, /^\/chat\/?$/, /^\/messages\/(?!new\b)[^/]+\/?$/];

/**
 * Phone tab bar: Home, Feed, Chat (raised, in the middle), Cart, Profile. Replaces the header's cart and account
 * buttons below `md`. Its height is published as `--bottom-nav-h` (globals.css) so
 * other bottom bars and full-height pages can sit above it.
 */
export function BottomNav({ locale, dict }: { locale: Locale; dict: Dictionary["nav"] }) {
  const path = usePathname().replace(/^\/[^/]+/, "") || "/";
  const { customer, cartCount } = useSession();
  if (HIDDEN_ON.some((route) => route.test(path))) return null;

  const tabs: { href: string; label: string; icon: LucideIcon; active: boolean; badge?: number; avatar?: boolean; raised?: boolean }[] = [
    { href: "", label: dict.home, icon: House, active: path === "/" },
    { href: "/feed", label: dict.feed, icon: Clapperboard, active: path.startsWith("/feed") },
    { href: "/chat", label: dict.chat, icon: MessageCircleMore, active: path.startsWith("/chat"), raised: true },
    { href: "/cart", label: dict.cart, icon: ShoppingCart, active: path.startsWith("/cart"), badge: cartCount },
    {
      href: "/account",
      label: dict.profile,
      icon: CircleUser,
      active: /^\/(account|login|register)(\/|$)/.test(path),
      avatar: true,
    },
  ];

  return (
    <>
      {/* Keeps the end of the page (footer) clear of the fixed bar. */}
      <div aria-hidden className="h-(--bottom-nav-h) shrink-0" />
      <nav
        data-bottom-nav
        aria-label={dict.label}
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_12px_rgb(0_0_0/0.06)] md:hidden"
      >
        <ul className="grid h-16 grid-cols-5">
          {tabs.map(({ href, label, icon: Icon, active, badge, avatar, raised }) =>
            raised ? (
              <li key={label} className="relative">
                {/* Chat: a raised green bubble, the way people reach for messaging apps. */}
                <Link
                  href={`/${locale}${href}`}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-full flex-col items-center justify-end gap-1 pb-1.5 text-[11px] font-bold ${active ? "text-primary" : "text-muted-foreground"}`}
                >
                  <span
                    className={`absolute -top-5 flex size-14 items-center justify-center rounded-full bg-gradient-to-br from-[#43a047] to-[#1b5e20] text-white shadow-lg shadow-primary/30 ring-4 ring-card transition-transform ${
                      active ? "scale-105" : ""
                    }`}
                  >
                    <Icon className="size-7" strokeWidth={2.25} />
                  </span>
                  {label}
                </Link>
              </li>
            ) : (
            <li key={label}>
              <Link
                href={`/${locale}${href}`}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors ${
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="relative">
                  {avatar && customer ? (
                    <Avatar
                      customer={customer}
                      className={`size-6 bg-primary text-[10px] text-primary-foreground ${active ? "ring-2 ring-primary ring-offset-1" : ""}`}
                    />
                  ) : (
                    <Icon className="size-6" strokeWidth={active ? 2.5 : 2.25} />
                  )}
                  {!!badge && (
                    <span className="absolute -right-2.5 -top-1.5 min-w-4.5 rounded-full bg-sale px-1 text-center text-[10px] font-semibold leading-4.5 tabular-nums text-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </span>
                {label}
              </Link>
            </li>
            ),
          )}
        </ul>
      </nav>
    </>
  );
}

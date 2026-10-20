"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Pages where the customer is finishing a task, reading notifications, chatting or watching
 * the feed, so the header drops its search box and the footer is hidden. Paths are matched
 * after the locale (/lo/cart → /cart).
 */
const FOCUS_ROUTES = [/^\/cart\/?$/, /^\/account\/orders\/?$/, /^\/notifications\/?$/, /^\/feed\/?$/, /^\/chat\/?$/, /^\/messages(\/.*)?$/];

export function useFocusRoute(): boolean {
  const path = usePathname().replace(/^\/[^/]+/, "");
  return FOCUS_ROUTES.some((route) => route.test(path));
}

/** Renders its (server-rendered) children everywhere except on focus routes. */
export function HideOnFocusRoutes({ children }: { children: React.ReactNode }) {
  return useFocusRoute() ? null : children;
}

/** Full-screen pages on phones (own header with a back button, no site header or tab bar). */
export const FULL_SCREEN_ON_PHONES = [/^\/chat\/?$/, /^\/messages\/(?!new\b)[^/]+\/?$/];

/** The site header: hidden on phones for full-screen pages (still shown from `md` up). */
export function HideHeaderOnPhones({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/^\/[^/]+/, "");
  // `md:contents` keeps the header a direct flow child on desktop, so it still sticks.
  return FULL_SCREEN_ON_PHONES.some((route) => route.test(path)) ? <div className="max-md:hidden md:contents">{children}</div> : children;
}

/** Pages that keep the full header (search, scan icon) but drop the footer: photo search results. */
const FOOTERLESS_ROUTES = [/^\/scan\/?$/];

/** The site footer: hidden on focus routes and footerless pages. */
export function HideFooterOnRoutes({ children }: { children: React.ReactNode }) {
  const path = usePathname().replace(/^\/[^/]+/, "");
  const focus = useFocusRoute();
  return focus || FOOTERLESS_ROUTES.some((route) => route.test(path)) ? null : children;
}

/**
 * Publishes the sticky header's height as `--header-h` on <html>, so other sticky bars
 * (e.g. order tabs) sit right below it whatever the screen size or header content.
 */
export function HeaderHeightVar() {
  const probe = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const header = probe.current?.closest("header");
    if (!header) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--header-h", `${header.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  return <span ref={probe} hidden />;
}

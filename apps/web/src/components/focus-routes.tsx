"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Pages where the customer is finishing a task, so the header drops its search box
 * and the footer is hidden. Paths are matched after the locale (/lo/cart → /cart).
 */
const FOCUS_ROUTES = [/^\/cart\/?$/, /^\/account\/orders\/?$/];

export function useFocusRoute(): boolean {
  const path = usePathname().replace(/^\/[^/]+/, "");
  return FOCUS_ROUTES.some((route) => route.test(path));
}

/** Renders its (server-rendered) children everywhere except on focus routes. */
export function HideOnFocusRoutes({ children }: { children: React.ReactNode }) {
  return useFocusRoute() ? null : children;
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

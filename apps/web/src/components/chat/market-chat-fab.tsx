"use client";

import type { Locale } from "@talad/shared";
import { MessageCircleMore } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Not over pages where it's in the way: the chat itself, shop chats, the cart and checkout steps. */
const HIDDEN_ON = [/^\/chat\/?$/, /^\/messages(\/.*)?$/, /^\/cart(\/.*)?$/, /^\/checkout(\/.*)?$/];

/**
 * Market Chat as a floating button at the bottom right (computers; phones have it in the tab
 * bar). It names itself on hover, so it reads as a chat helper, not just an icon.
 */
export function MarketChatFab({ locale, label }: { locale: Locale; label: string }) {
  const path = usePathname().replace(/^\/[^/]+/, "");
  if (HIDDEN_ON.some((route) => route.test(path))) return null;
  return (
    <Link
      href={`/${locale}/chat`}
      aria-label={label}
      className="group fixed bottom-6 right-6 z-40 hidden items-center gap-2 rounded-full bg-primary py-3 pl-3 pr-3 text-primary-foreground shadow-xl shadow-primary/30 ring-4 ring-white/70 transition-all hover:pr-5 hover:brightness-110 md:flex dark:ring-black/30"
    >
      <span className="relative flex size-8 items-center justify-center">
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-white/30 [animation-duration:2.5s]" />
        <MessageCircleMore className="relative size-7" />
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-semibold transition-[max-width] duration-300 group-hover:max-w-40 group-focus-visible:max-w-40">
        {label}
      </span>
    </Link>
  );
}

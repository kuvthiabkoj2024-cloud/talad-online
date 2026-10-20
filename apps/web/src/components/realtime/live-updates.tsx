"use client";

import type { Locale, RealtimeEvent } from "@talad/shared";
import { Bell, MessageCircle, Package, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/components/auth/session-provider";
import { connectEventStream } from "@/lib/event-stream";
import { interpolate } from "@/lib/format";
import { playNotificationSound, unlockNotificationSound } from "@/lib/notify-sound";
import { LIVE_MESSAGE_EVENT, LIVE_NOTIFICATION_EVENT } from "@/lib/live-events";

interface Toast {
  id: string;
  icon: "order" | "message" | "other";
  title: string;
  body: string;
  href: string | null;
}

const SHOW_MS = 6000;

/**
 * Live updates for a signed-in customer: order status changes and shop replies arrive as
 * they happen — the bell badge goes up, a card pops up (tap it to open), and a chime plays.
 * Pages that show this data (notifications, an order, a chat) refresh themselves.
 */
export function LiveUpdates({ locale, dict }: { locale: Locale; dict: { view: string; close: string; newMessage: string } }) {
  const { customer, setNotificationCount } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const live = useRef({ pathname, dict, locale });
  useEffect(() => {
    live.current = { pathname, dict, locale };
  });

  const signedIn = !!customer;
  useEffect(() => {
    if (!signedIn) return;
    unlockNotificationSound();
    const push = (t: Omit<Toast, "id">) => {
      const id = crypto.randomUUID?.() ?? String(Date.now());
      setToasts((list) => [...list.slice(-2), { ...t, id }]);
      setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), SHOW_MS);
      playNotificationSound();
    };
    return connectEventStream<RealtimeEvent>({
      url: "/api/events",
      onEvent: (event) => {
        const { pathname, dict, locale } = live.current;
        if (event.kind === "notification") {
          setNotificationCount((n) => n + 1);
          window.dispatchEvent(new CustomEvent(LIVE_NOTIFICATION_EVENT, { detail: event }));
          const text = event.i18n?.[locale] ?? { title: event.title, body: event.body };
          push({ icon: event.type === "ORDER" ? "order" : "other", title: text.title, body: text.body, href: event.link ? `/${locale}${event.link}` : null });
        } else if (event.kind === "message") {
          window.dispatchEvent(new CustomEvent(LIVE_MESSAGE_EVENT, { detail: event.conversationId }));
          const href = `/${locale}/messages/${event.conversationId}`;
          // Reading that chat already: the reply just appears.
          if (pathname === href) return;
          push({ icon: "message", title: interpolate(dict.newMessage, { name: event.from }), body: event.preview, href });
        }
      },
    });
  }, [signedIn, setNotificationCount]);

  if (!toasts.length) return null;
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => {
        const Icon = t.icon === "order" ? Package : t.icon === "message" ? MessageCircle : Bell;
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-md animate-[modal-in_200ms_ease-out] items-start gap-3 rounded-2xl bg-card p-3 pr-2 shadow-xl ring-1 ring-border"
          >
            <button
              type="button"
              onClick={() => {
                setToasts((list) => list.filter((x) => x.id !== t.id));
                if (t.href) router.push(t.href);
              }}
              className="flex min-w-0 flex-1 items-start gap-3 text-left"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{t.title}</span>
                <span className="line-clamp-2 text-sm text-muted-foreground">{t.body}</span>
                {t.href && <span className="mt-0.5 block text-xs font-semibold text-primary">{dict.view}</span>}
              </span>
            </button>
            <button
              type="button"
              aria-label={dict.close}
              onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              className="rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

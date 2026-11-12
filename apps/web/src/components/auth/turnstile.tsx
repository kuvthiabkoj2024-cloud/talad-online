"use client";

import type { Locale } from "@talad/shared";
import { useEffect, useRef } from "react";

/** Public key of the Cloudflare Turnstile widget; without it there's no robot check (development). */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null;

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let script: Promise<TurnstileApi> | null = null;
function loadTurnstile(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    el.async = true;
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")));
    el.onerror = () => {
      script = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(el);
  });
  return script;
}

/**
 * Cloudflare's robot check, shown as its box across the form ("Verifying… → Success", a
 * checkbox to tick when Cloudflare is unsure). Reports a token (single use, for the
 * X-Turnstile-Token header), or null while there's none, and Cloudflare's error code when the
 * check can't run
 * (e.g. 110200: this hostname isn't allowed for the site key).
 * Change `resetKey` after each use to get a fresh token.
 */
export function Turnstile({
  locale,
  action,
  resetKey = 0,
  className = "",
  onToken,
  onError,
}: {
  locale: Locale;
  /** Shown in Cloudflare's analytics, e.g. "otp". */
  action: string;
  resetKey?: number;
  /** Extra classes for the box (e.g. spacing). */
  className?: string;
  onToken: (token: string | null) => void;
  onError?: (code: string) => void;
}) {
  const slot = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const handlers = useRef({ onToken, onError });
  useEffect(() => {
    handlers.current = { onToken, onError };
  });

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !slot.current) return;
        widget.current = api.render(slot.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          language: locale,
          appearance: "always",
          size: "flexible",
          callback: (token: string) => handlers.current.onToken(token),
          "expired-callback": () => handlers.current.onToken(null),
          "error-callback": (code: string) => {
            handlers.current.onToken(null);
            handlers.current.onError?.(String(code));
            // Handled here; Turnstile retries on its own where it can.
            return true;
          },
          "unsupported-callback": () => handlers.current.onError?.("unsupported"),
        });
      })
      .catch(() => handlers.current.onError?.("script"));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [action, locale]);

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return;
    handlers.current.onToken(null);
    window.turnstile?.reset(widget.current);
  }, [resetKey]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={slot} className={`min-h-[65px] w-full ${className}`} />;
}

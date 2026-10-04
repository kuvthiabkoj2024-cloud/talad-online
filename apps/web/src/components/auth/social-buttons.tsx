"use client";

import type { Locale } from "@talad/shared";
import { useEffect, useRef, useState } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { interpolate } from "@/lib/format";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const APPLE_CLIENT_ID = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
const APPLE_REDIRECT_URI = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URI;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: { client_id: string; callback: (r: { credential: string }) => void }): void;
          renderButton(el: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
    AppleID?: {
      auth: {
        init(config: Record<string, unknown>): void;
        signIn(): Promise<{
          authorization: { id_token: string };
          user?: { name?: { firstName?: string; lastName?: string } };
        }>;
      };
    };
  }
}

const scripts = new Map<string, Promise<void>>();
function loadScript(src: string): Promise<void> {
  if (!scripts.has(src)) {
    scripts.set(
      src,
      new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = src;
        el.async = true;
        el.onload = () => resolve();
        el.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(el);
      }),
    );
  }
  return scripts.get(src)!;
}

type Provider = "google" | "apple";

/**
 * "Continue with Google / Apple". When a provider's client id is not configured
 * the button explains that instead of failing silently.
 */
export function SocialButtons({
  locale,
  dict,
  disabled,
  onToken,
  onNotice,
}: {
  locale: Locale;
  dict: Dictionary["auth"];
  disabled?: boolean;
  onToken: (provider: Provider, idToken: string, name?: string) => void;
  onNotice: (message: string) => void;
}) {
  const googleSlot = useRef<HTMLDivElement>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  });

  // Google's own button (required for ID-token sign-in), styled to match ours.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    loadScript("https://accounts.google.com/gsi/client")
      .then(() => {
        const slot = googleSlot.current;
        if (cancelled || !slot || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: ({ credential }) => onTokenRef.current("google", credential),
        });
        window.google.accounts.id.renderButton(slot, {
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          width: Math.min(slot.clientWidth, 400),
          locale,
        });
        setGoogleReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [locale]);

  async function apple() {
    if (!APPLE_CLIENT_ID) {
      onNotice(interpolate(dict.notConfigured, { provider: "Apple" }));
      return;
    }
    try {
      await loadScript(
        "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js",
      );
      window.AppleID!.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: "name email",
        redirectURI: APPLE_REDIRECT_URI ?? window.location.origin,
        usePopup: true,
      });
      const res = await window.AppleID!.auth.signIn();
      const name = [res.user?.name?.firstName, res.user?.name?.lastName].filter(Boolean).join(" ");
      onToken("apple", res.authorization.id_token, name || undefined);
    } catch {
      // popup closed or cancelled
    }
  }

  const base =
    "flex h-12 w-full items-center justify-center gap-3 rounded-full text-sm font-semibold transition-colors disabled:opacity-60";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {GOOGLE_CLIENT_ID ? (
        <div ref={googleSlot} className={`flex h-12 items-center justify-center ${googleReady ? "" : "animate-pulse rounded-full bg-muted"}`} />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onNotice(interpolate(dict.notConfigured, { provider: "Google" }))}
          className={`${base} border border-border bg-card hover:bg-muted`}
        >
          <GoogleLogo />
          Google
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={apple}
        className={`${base} bg-black text-white hover:bg-black/85`}
      >
        <AppleLogo />
        Apple
      </button>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 48 48" className="size-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-5 fill-current">
      <path d="M16.37 12.63c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.82-.81-3-.79-1.54.02-2.96.9-3.76 2.28-1.6 2.78-.41 6.9 1.15 9.16.76 1.1 1.67 2.34 2.86 2.3 1.15-.05 1.58-.74 2.97-.74 1.38 0 1.77.74 2.98.72 1.23-.02 2.01-1.12 2.76-2.23.87-1.28 1.23-2.51 1.25-2.58-.03-.01-2.4-.92-2.42-3.66zM14.1 5.88c.63-.77 1.06-1.83.94-2.88-.91.04-2.01.61-2.66 1.37-.58.67-1.09 1.75-.96 2.78 1.02.08 2.05-.52 2.68-1.27z" />
    </svg>
  );
}

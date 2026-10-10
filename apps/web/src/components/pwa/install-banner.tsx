"use client";

import { Download, Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

/** Chrome/Edge/Android: the deferred native install prompt. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "talad_install_dismissed_at";
const DISMISS_FOR_MS = 14 * 86_400_000;

/**
 * Where the banner can show: `installed` (already running as an app), `dismissed` (recently
 * closed), `ios` (Safari has no install event — show Add to Home Screen steps) or `web`.
 */
type Env = "server" | "installed" | "dismissed" | "ios" | "web";

function readEnv(): Env {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  try {
    if (Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_FOR_MS) return "dismissed";
  } catch {
    // Storage blocked: just show the banner.
  }
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios && !/crios|fxios|edgios/i.test(ua) ? "ios" : "web";
}
const noSubscribe = () => () => {};

export interface InstallDict {
  title: string;
  body: string;
  install: string;
  later: string;
  iosTitle: string;
  iosStep1: string;
  iosStep2: string;
}

/**
 * Registers the service worker (production builds) and offers to install the storefront as
 * an app: the native prompt where the browser supports it, or Add to Home Screen steps on iOS.
 */
export function InstallBanner({ dict }: { dict: InstallDict }) {
  const env = useSyncExternalStore(noSubscribe, readEnv, () => "server" as Env);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);
  const [iosReady, setIosReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setClosed(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    // Give iOS visitors a moment on the page before suggesting the home screen.
    const timer = setTimeout(() => setIosReady(true), 4000);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(timer);
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode: hide for this visit only.
    }
    setClosed(true);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome === "accepted") setClosed(true);
    else dismiss();
  }

  const ios = env === "ios" && iosReady;
  if (closed || (!ios && !(env === "web" && prompt))) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-title"
      className="fixed inset-x-3 bottom-[calc(var(--bottom-nav-h)+0.75rem)] z-40 mx-auto max-w-md animate-[modal-in_220ms_ease-out] rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-black/15 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static app icon */}
        <img src="/icons/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p id="install-title" className="font-semibold">
            {ios ? dict.iosTitle : dict.title}
          </p>
          {ios ? (
            <ol className="mt-1.5 flex flex-col gap-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">1.</span>
                {dict.iosStep1.split("{icon}")[0]}
                <Share aria-hidden className="size-4 text-primary" />
                {dict.iosStep1.split("{icon}")[1]}
              </li>
              <li className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">2.</span>
                {dict.iosStep2.split("{icon}")[0]}
                <SquarePlus aria-hidden className="size-4 text-primary" />
                {dict.iosStep2.split("{icon}")[1]}
              </li>
            </ol>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">{dict.body}</p>
          )}
        </div>
        <button type="button" onClick={dismiss} aria-label={dict.later} className="-mt-1 -mr-1 rounded-full p-1.5 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      {!ios && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={dismiss} className="h-10 rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted">
            {dict.later}
          </button>
          <button
            type="button"
            onClick={() => void install()}
            className="flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 hover:brightness-110"
          >
            <Download className="size-4" />
            {dict.install}
          </button>
        </div>
      )}
    </div>
  );
}

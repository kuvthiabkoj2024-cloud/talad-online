"use client";

import { useEffect } from "react";

/** Next.js errors when an open page's code is older than the server (it was updated meanwhile). */
const STALE = /An unexpected response was received from the server|Failed to find Server Action|Server action not found|ChunkLoadError|Loading chunk [\w-]+ failed/i;
const KEY = "talad_stale_reload_at";
/** Don't reload in a loop if the problem isn't a stale page. */
const MIN_GAP_MS = 60_000;

/**
 * A page left open across an update (an installed app in the background, a tab from
 * yesterday) calls the server with old code, and actions like "Buy" fail with "An unexpected
 * response was received from the server". Reloading picks up the current code; the chat and
 * cart are kept on the server, so nothing is lost.
 */
/** Reloads the page (at most once a minute) when `reason` says the page's code is out of date. */
export function reloadIfStale(reason: unknown): void {
  const message = reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason ?? "");
  if (!STALE.test(message)) return;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < MIN_GAP_MS) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Storage blocked: still reload once for this page.
  }
  window.location.reload();
}

export function StaleClientReload() {
  useEffect(() => {
    const recover = reloadIfStale;
    const onRejection = (e: PromiseRejectionEvent) => recover(e.reason);
    const onError = (e: ErrorEvent) => recover(e.error ?? e.message);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}

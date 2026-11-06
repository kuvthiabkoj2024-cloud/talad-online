// Same as packages/ui/src/lib/pwa.ts (the storefront doesn't use @talad/ui).
/**
 * Installed-app (PWA) helpers shared with the service workers (public/sw.js):
 * the number on the app icon, and opening the page a tapped push notification is about.
 */

/** The number on the installed app's icon (0 clears it). Silently does nothing where unsupported. */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    void done?.catch(() => {});
  } catch {
    // Not installed, no permission, or no Badging API.
  }
}

/** Where the service worker keeps the address of a tapped notification until a page opens it. */
const PENDING_CACHE = "push-open";
const PENDING_KEY = "/__push-open";
/** A remembered tap older than this is stale (the app was opened some other way later). */
const PENDING_MS = 60_000;

/**
 * Opens what a tapped push notification is about, two ways:
 * - the app is already open: the service worker posts `{ type: 'push-open', url }` (and waits
 *   for the reply, else it navigates the tab itself);
 * - the app was closed: some phones (iPhone) start it at its home page instead of the address
 *   asked for, so the worker also leaves the address behind and the page goes there on start.
 * `go` gets a same-site path (with query); returns a cleanup function.
 */
export function listenForPushOpens(go: (path: string) => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return () => {};
  const toPath = (url: string): string | null => {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin ? u.pathname + u.search + u.hash : null;
    } catch {
      return null;
    }
  };
  const here = () => location.pathname + location.search + location.hash;

  const onMessage = (e: MessageEvent) => {
    const data = e.data as { type?: string; url?: string } | null;
    if (data?.type !== "push-open" || typeof data.url !== "string") return;
    e.ports[0]?.postMessage("ok");
    void forgetPending();
    const path = toPath(data.url);
    if (path && path !== here()) go(path);
  };
  navigator.serviceWorker.addEventListener("message", onMessage);
  navigator.serviceWorker.startMessages?.();

  void takePending().then((url) => {
    const path = url && toPath(url);
    if (path && path !== here()) go(path);
  });
  return () => navigator.serviceWorker.removeEventListener("message", onMessage);
}

async function takePending(): Promise<string | null> {
  try {
    if (!("caches" in window)) return null;
    const cache = await caches.open(PENDING_CACHE);
    const hit = await cache.match(PENDING_KEY);
    if (!hit) return null;
    await cache.delete(PENDING_KEY);
    const { url, at } = (await hit.json()) as { url?: string; at?: number };
    return typeof url === "string" && typeof at === "number" && Date.now() - at < PENDING_MS ? url : null;
  } catch {
    return null;
  }
}

async function forgetPending(): Promise<void> {
  try {
    if ("caches" in window) await (await caches.open(PENDING_CACHE)).delete(PENDING_KEY);
  } catch {
    // Nothing to forget.
  }
}

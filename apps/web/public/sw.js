/*
 * MC Mart storefront service worker (installable PWA + offline fallback).
 *
 * - Pages always come from the network (prices, stock and carts must be fresh); when the
 *   network is down the visitor gets /offline.html instead of the browser's error page.
 *   Pages are never cached, so nothing personal stays on shared phones.
 * - Hashed build files (/_next/static) are cache-first; icons and optimized images are
 *   stale-while-revalidate with a size cap. Only files the server marks immutable are kept:
 *   `next dev` serves changing files under the same names, and a phone that installed this
 *   worker from a production build must not keep running old code against a dev server.
 * - API calls, Server Actions and RSC requests pass straight through.
 * - Web Push notifications are shown here (bottom of the file).
 *
 * Bump VERSION when this file's caching rules change.
 */
const VERSION = "v5";
const STATIC = `talad-static-${VERSION}`;
const IMAGES = `talad-images-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];
const MAX_IMAGES = 150;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("talad-") && k !== STATIC && k !== IMAGES).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/_next/image") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/logos/")) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && /immutable/.test(res.headers.get("cache-control") ?? "")) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(IMAGES);
  // Any cache: precached icons live in the static cache.
  const hit = await caches.match(request);
  const update = fetch(request)
    .then(async (res) => {
      if (res.ok) {
        await cache.put(request, res.clone());
        await trim(cache, MAX_IMAGES);
      }
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return update;
}

/** Drops the oldest entries beyond `max` (Cache keys keep insertion order). */
async function trim(cache, max) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/*
 * Web Push (services/api notifications/push.service.ts): orders, activity and chat messages
 * as system notifications, also when no tab is open. Payload: { title, body, url, tag, badge }.
 */
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  if (!data || !data.title) return;
  event.waitUntil(
    Promise.all([
      setBadge(data.badge),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((tabs) => {
        // The app is open in front: it already shows its own pop-up and chime. Safari, though,
        // ends a subscription whose pushes show nothing, so there it always shows one.
        const safari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent);
        if (!safari && tabs.some((t) => t.focused)) return;
        return self.registration.showNotification(data.title, {
          body: data.body,
          tag: data.tag,
          renotify: Boolean(data.tag),
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          data: { url: data.url || "/" },
        });
      }),
    ]),
  );
});

/** The number on the installed app's icon: unread notifications + chat messages (0 clears it). */
function setBadge(count) {
  if (typeof count !== "number" || !self.navigator.setAppBadge) return Promise.resolve();
  return (count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge()).catch(() => {});
}

/*
 * A tapped notification opens what it is about. An open app is asked to go there itself
 * (lib/pwa.ts listenForPushOpens answers), else its tab is navigated, else a window opens.
 * The address is also left in a cache for a page to pick up on start, because an iPhone
 * opens a closed app at its home page whatever address it is given.
 */
const PENDING_CACHE = "push-open";
const PENDING_KEY = "/__push-open";

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin);
  event.waitUntil(openFromPush(url));
});

async function openFromPush(url) {
  // Another site (a shop owner's Seller Center news on the storefront): just open it.
  if (url.origin !== self.location.origin) return self.clients.openWindow(url.href);
  const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const tab = tabs.find((t) => t.focused) ?? tabs.find((t) => t.visibilityState === "visible") ?? tabs[0];
  if (tab) {
    await tab.focus().catch(() => {});
    if (await askToOpen(tab, url.href)) return;
    if (typeof tab.navigate === "function" && (await tab.navigate(url.href).catch(() => null))) return;
  }
  await remember(url.href);
  return self.clients.openWindow(url.href);
}

/** Posts the address to an open page; true once it answers. */
function askToOpen(tab, url) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), 1500);
    channel.port1.onmessage = () => {
      clearTimeout(timer);
      resolve(true);
    };
    try {
      tab.postMessage({ type: "push-open", url }, [channel.port2]);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

async function remember(url) {
  try {
    const cache = await caches.open(PENDING_CACHE);
    await cache.put(PENDING_KEY, new Response(JSON.stringify({ url, at: Date.now() }), { headers: { "content-type": "application/json" } }));
  } catch {
    // The window still opens at the address on most phones.
  }
}

/*
 * Taladonline Seller Center service worker (installable PWA + offline shell).
 *
 * - Navigations are network-first; the last good index.html is kept so the app still opens
 *   offline (its screens then show "check your connection"), else /offline.html.
 * - Hashed Vite build files (/assets) are cache-first; icons and Google Fonts are
 *   stale-while-revalidate.
 * - API calls (another origin, with the seller's session) are never touched.
 * - Web Push notifications are shown here (bottom of the file).
 *
 * Bump VERSION when this file's caching rules change.
 */
const VERSION = "v1";
const STATIC = `seller-static-${VERSION}`;
const RUNTIME = `seller-runtime-${VERSION}`;
const SHELL_URL = "/index.html";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, SHELL_URL, "/icons/icon-192.png", "/icons/icon.svg"];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

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
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("seller-") && k !== STATIC && k !== RUNTIME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(STATIC).then((c) => c.put(SHELL_URL, res.clone()));
          return res;
        })
        .catch(async () => (await caches.match(SHELL_URL)) ?? caches.match(OFFLINE_URL)),
    );
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if ((url.origin === self.location.origin && url.pathname.startsWith("/icons/")) || FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(RUNTIME);
  // Any cache: precached icons live in the static cache.
  const hit = await caches.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return update;
}

/*
 * Web Push (services/api notifications/push.service.ts): orders, activity and chat messages
 * as system notifications, also when no tab is open. Payload: { title, body, url, tag }.
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
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (tabs) => {
      const tab = tabs.find((t) => new URL(t.url).origin === self.location.origin);
      if (tab) {
        await tab.focus();
        return tab.navigate(url).catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});

/*
 * MC Mart Seller Center service worker (installable PWA + offline shell).
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
const VERSION = "v4";
const STATIC = `seller-static-${VERSION}`;
const RUNTIME = `seller-runtime-${VERSION}`;
const SHELL_URL = "/index.html";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, SHELL_URL, "/icons/icon-192.png", "/icons/logo.png"];
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

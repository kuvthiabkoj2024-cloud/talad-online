/**
 * Web Push in the browser: system notifications from Taladonline on desktop browsers and
 * installed PWAs, even when the site is closed. The app's service worker (`/sw.js`) shows them;
 * the app passes how to reach its API (`save` / `remove`), since the storefront and the Seller
 * Center send their sessions differently.
 *
 * iPhone and iPad only allow it once the site is added to the Home Screen (iOS 16.4+).
 */
export type PushState =
  /** This browser can't (old browser, or a private window). */
  | 'unsupported'
  /** iPhone/iPad Safari: add to the Home Screen first. */
  | 'install'
  /** Blocked in the browser's site settings; only the person can undo that. */
  | 'denied'
  | 'off'
  | 'on'

/** `PushSubscription.toJSON()` with the app's language. */
export interface PushSubscriptionBody {
  endpoint: string
  keys: { p256dh: string; auth: string }
  locale: string
}

const SW_URL = '/sw.js'

function isIosBrowserTab(): boolean {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return ios && !standalone
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** The app's worker; registered here when the app hasn't yet (it only does so in production builds). */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (!existing) await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' })
  return navigator.serviceWorker.ready
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/')
  return (await reg?.pushManager.getSubscription()) ?? null
}

export async function getPushState(): Promise<PushState> {
  if (typeof window !== 'undefined' && isIosBrowserTab()) return 'install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  return (await currentSubscription().catch(() => null)) ? 'on' : 'off'
}

function toBody(sub: PushSubscription, locale: string): PushSubscriptionBody {
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
  return { endpoint: json.endpoint, keys: json.keys, locale }
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * Asks for permission (call it from a tap or click) and subscribes this browser.
 * Resolves to the new state: `on`, or `denied` / `off` if the person said no.
 */
export async function enablePush(opts: {
  publicKey: string
  locale: string
  save: (body: PushSubscriptionBody) => Promise<void>
}): Promise<PushState> {
  if (!supported()) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await registration()
  let sub = await reg.pushManager.getSubscription()
  // Subscribed with an older server key: start over with the current one.
  if (sub && sub.options.applicationServerKey) {
    const old = new Uint8Array(sub.options.applicationServerKey)
    const now = keyBytes(opts.publicKey)
    if (old.length !== now.length || old.some((b, i) => b !== now[i])) {
      await sub.unsubscribe()
      sub = null
    }
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(opts.publicKey) })
  await opts.save(toBody(sub, opts.locale))
  return 'on'
}

/** Unsubscribes this browser and tells the API (signing out, or turning it off). */
export async function disablePush(remove: (endpoint: string) => Promise<void>): Promise<void> {
  if (!supported()) return
  const sub = await currentSubscription().catch(() => null)
  if (!sub) return
  await remove(sub.endpoint).catch(() => {})
  await sub.unsubscribe().catch(() => {})
}

/**
 * Re-sends an existing subscription (after signing in, or when the language changed), so the
 * notifications reach the account now using this browser. Does nothing without one.
 */
export async function syncPush(locale: string, save: (body: PushSubscriptionBody) => Promise<void>): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') return
  const sub = await currentSubscription().catch(() => null)
  if (sub) await save(toBody(sub, locale)).catch(() => {})
}

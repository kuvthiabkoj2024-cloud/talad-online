import { Button } from '@talad/ui/components/button'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useI18n } from '@/i18n/context'

/** Chrome/Edge/Android: the deferred native install prompt. */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'talad_seller_install_dismissed_at'
const DISMISS_FOR_MS = 14 * 86_400_000

/** `installed` (running as an app), `dismissed` (closed recently), `ios` (Safari: manual steps) or `web`. */
type Env = 'installed' | 'dismissed' | 'ios' | 'web'

function readEnv(): Env {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return 'installed'
  try {
    if (Date.now() - Number(localStorage.getItem(DISMISS_KEY) ?? 0) < DISMISS_FOR_MS) return 'dismissed'
  } catch {
    // Storage blocked: just show the banner.
  }
  const ua = navigator.userAgent
  const ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios && !/crios|fxios|edgios/i.test(ua) ? 'ios' : 'web'
}
const noSubscribe = () => () => {}

/** Offers to install Seller Center: the native prompt where supported, Add to Home Screen steps on iOS. */
export function InstallBanner() {
  const { t } = useI18n()
  const env = useSyncExternalStore(noSubscribe, readEnv)
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null)
  const [closed, setClosed] = useState(false)
  const [iosReady, setIosReady] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPrompt(e as InstallPromptEvent)
    }
    const onInstalled = () => setClosed(true)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    const timer = setTimeout(() => setIosReady(true), 4000)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
      clearTimeout(timer)
    }
  }, [])

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // Private mode: hide for this visit only.
    }
    setClosed(true)
  }

  async function install() {
    if (!prompt) return
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    setPrompt(null)
    if (outcome === 'accepted') setClosed(true)
    else dismiss()
  }

  const ios = env === 'ios' && iosReady
  if (closed || (!ios && !(env === 'web' && prompt))) return null
  const step = (text: string, Icon: typeof Share, n: number) => (
    <li className="flex items-center gap-1.5">
      <span className="font-semibold text-foreground">{n}.</span>
      {text.split('{icon}')[0]}
      <Icon aria-hidden className="size-4 text-primary" />
      {text.split('{icon}')[1]}
    </li>
  )

  return (
    <div
      role="dialog"
      aria-labelledby="install-title"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-md animate-in rounded-2xl border bg-card p-4 shadow-2xl shadow-black/15 fade-in slide-in-from-bottom-4 sm:inset-x-auto sm:right-6 sm:bottom-6"
    >
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p id="install-title" className="font-semibold">
            {ios ? t.pwa.iosTitle : t.pwa.title}
          </p>
          {ios ? (
            <ol className="mt-1.5 flex flex-col gap-1 text-sm text-muted-foreground">
              {step(t.pwa.iosStep1, Share, 1)}
              {step(t.pwa.iosStep2, SquarePlus, 2)}
            </ol>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">{t.pwa.body}</p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1 rounded-full" aria-label={t.pwa.later} onClick={dismiss}>
          <X />
        </Button>
      </div>
      {!ios && (
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" onClick={dismiss}>
            {t.pwa.later}
          </Button>
          <Button onClick={() => void install()}>
            <Download />
            {t.pwa.install}
          </Button>
        </div>
      )}
    </div>
  )
}

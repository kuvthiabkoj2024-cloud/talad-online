import { Button } from '@talad/ui/components/button'
import { disablePush, enablePush, getPushState, type PushState } from '@talad/ui/lib/web-push'
import { useQuery } from '@tanstack/react-query'
import { BellRing, CheckCircle2, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { removePushSubscription, savePushSubscription } from '@/lib/push'

/**
 * "Get notifications on this device" at the bottom of the bell: Web Push for new orders and
 * customer messages, shown by the system even with the Seller Center closed. Hidden where the
 * browser can't, or while push is off on the server.
 */
export function PushToggle() {
  const { t, locale } = useI18n()
  const config = useQuery({ queryKey: ['push-config'], queryFn: () => api<{ publicKey: string | null }>('/push/config'), staleTime: Infinity })
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    void getPushState().then(setState)
  }, [])

  const publicKey = config.data?.publicKey
  if (!publicKey || !state || state === 'unsupported') return null

  async function turnOn() {
    setBusy(true)
    setFailed(false)
    try {
      setState(await enablePush({ publicKey: publicKey!, locale, save: savePushSubscription }))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  async function turnOff() {
    setBusy(true)
    await disablePush(removePushSubscription)
    setState('off')
    setBusy(false)
  }

  if (state === 'on') {
    return (
      <div className="flex items-center gap-2 border-t bg-brand-soft/50 px-4 py-2.5 text-sm text-primary">
        <CheckCircle2 className="size-4 shrink-0" />
        <span className="flex-1 font-medium">{t.notifications.pushEnabled}</span>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void turnOff()}>
          {t.notifications.pushTurnOff}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 border-t px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary">
        <BellRing className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t.notifications.pushTitle}</p>
        <p className="text-xs text-muted-foreground">
          {state === 'denied' ? t.notifications.pushDenied : state === 'install' ? t.notifications.pushInstall : t.notifications.pushBody}
        </p>
        {failed && <p className="mt-1 text-xs text-destructive">{t.notifications.pushFailed}</p>}
      </div>
      {state === 'off' && (
        <Button size="sm" disabled={busy} onClick={() => void turnOn()}>
          {busy && <LoaderCircle className="animate-spin" />}
          {t.notifications.pushTurnOn}
        </Button>
      )}
    </div>
  )
}

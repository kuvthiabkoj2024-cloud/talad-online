import type { RealtimeEvent } from '@talad/shared'
import { connectEventStream } from '@talad/ui/lib/event-stream'
import { playNotificationSound, unlockNotificationSound } from '@talad/ui/lib/notify-sound'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/context'
import { getToken } from '@/lib/api'
import { NOTIFICATIONS_KEY, notificationText } from '@/lib/realtime'

/** Live staff notifications (e.g. a new shop to review): the bell refreshes, a toast shows, a chime plays. */
export function RealtimeBridge() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const live = useRef({ t, locale, navigate })
  useEffect(() => {
    live.current = { t, locale, navigate }
  })

  useEffect(() => {
    unlockNotificationSound()
    const refresh = () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
    return connectEventStream<RealtimeEvent>({
      url: `${import.meta.env.VITE_API_URL}/admin/events`,
      headers: (): Record<string, string> => {
        const token = getToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
      },
      onOpen: refresh,
      onEvent: (event) => {
        if (event.kind !== 'notification') return
        const { t, locale, navigate } = live.current
        refresh()
        // The shops list shows the new application straight away.
        if (event.type === 'SHOP_APPLICATION') void queryClient.invalidateQueries({ queryKey: ['admin', 'shops'] })
        const text = notificationText(event, locale)
        toast(text.title, {
          description: text.body,
          ...(event.link && { action: { label: t.notifications.view, onClick: () => navigate(event.link!) } }),
        })
        playNotificationSound()
      },
    })
  }, [queryClient])

  return null
}

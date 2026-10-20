import type { RealtimeEvent } from '@talad/shared'
import { connectEventStream } from '@talad/ui/lib/event-stream'
import { playNotificationSound, unlockNotificationSound } from '@talad/ui/lib/notify-sound'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ME_KEY } from '@/auth/context'
import { queryKeys } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { getToken } from '@/lib/api'
import { fill } from '@/lib/format'
import { MESSAGE_EVENT, notificationText } from '@/lib/realtime'

/**
 * Live updates for the Seller Center: new orders, likes, comments, chat messages and the
 * shop's approval arrive as they happen — the bell and lists refresh, a toast shows, and a
 * chime plays.
 */
export function RealtimeBridge() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t, locale } = useI18n()
  // The handler outlives renders: read the latest values through refs.
  const live = useRef({ pathname, t, locale, navigate })
  useEffect(() => {
    live.current = { pathname, t, locale, navigate }
  })

  useEffect(() => {
    unlockNotificationSound()
    const refreshInbox = () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
    return connectEventStream<RealtimeEvent>({
      url: `${import.meta.env.VITE_API_URL}/me/shop/events`,
      headers: (): Record<string, string> => {
        const token = getToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
      },
      // (Re)connected: catch up on anything missed while offline.
      onOpen: refreshInbox,
      onEvent: (event) => {
        const { t, locale, pathname, navigate } = live.current
        if (event.kind === 'notification') {
          refreshInbox()
          if (event.type === 'ORDER') {
            void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
            void queryClient.invalidateQueries({ queryKey: queryKeys.summary })
          }
          if (event.type === 'SHOP_STATUS') void queryClient.invalidateQueries({ queryKey: ME_KEY })
          const text = notificationText(event, locale)
          toast(text.title, {
            description: text.body,
            ...(event.link && { action: { label: t.notifications.view, onClick: () => navigate(event.link!) } }),
          })
          playNotificationSound()
        } else if (event.kind === 'message') {
          void queryClient.invalidateQueries({ queryKey: [...queryKeys.conversations, 'list'] })
          void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages })
          window.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail: event.conversationId }))
          // Already reading this chat: the message just appears.
          if (pathname === `/messages/${event.conversationId}`) return
          toast(fill(t.notifications.newMessage, { name: event.from }), {
            description: event.preview,
            action: { label: t.notifications.open, onClick: () => navigate(`/messages/${event.conversationId}`) },
          })
          playNotificationSound()
        } else if (event.kind === 'shop.status') {
          void queryClient.invalidateQueries({ queryKey: ME_KEY })
          void queryClient.invalidateQueries({ queryKey: queryKeys.shop })
        }
      },
    })
  }, [queryClient])

  return null
}

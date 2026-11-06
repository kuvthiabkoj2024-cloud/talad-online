import { listenForPushOpens, setAppBadge } from '@talad/ui/lib/pwa'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { queryKeys, useUnreadMessages } from '@/hooks/queries'
import { api } from '@/lib/api'

/**
 * For the Seller Center installed on the home screen: the number on its icon (unread
 * notifications + unread customer messages, as on the bell and Messages), and opening the page
 * a tapped push notification is about (see public/sw.js).
 */
export function PwaBridge() {
  const navigate = useNavigate()
  const go = useRef(navigate)
  useEffect(() => {
    go.current = navigate
  })
  const notifications = useQuery({
    queryKey: queryKeys.notificationsUnread,
    queryFn: () => api<{ count: number }>('/me/shop/notifications/unread-count'),
    select: (d) => d.count,
    refetchInterval: 120_000,
  })
  const messages = useUnreadMessages()
  const ready = notifications.isSuccess && messages.isSuccess
  const count = (notifications.data ?? 0) + (messages.data ?? 0)

  useEffect(() => {
    if (ready) setAppBadge(count)
  }, [ready, count])

  useEffect(() => listenForPushOpens((path) => void go.current(path)), [])
  return null
}

import { Button } from '@talad/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@talad/ui/components/popover'
import { setSoundEnabled, soundEnabled } from '@talad/ui/lib/notify-sound'
import { cn } from '@talad/ui/lib/utils'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, CheckCheck, LoaderCircle, Store, Volume2, VolumeX } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatDate } from '@/lib/format'
import { NOTIFICATIONS_KEY, NOTIFICATIONS_UNREAD_KEY, notificationText, type AdminNotification, type AdminNotificationPage } from '@/lib/realtime'

/** The top bar bell: unread badge, the latest notifications, mark all read, sound on/off. */
export function NotificationBell() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [sound, setSound] = useState(soundEnabled)
  const unread = useQuery({
    queryKey: NOTIFICATIONS_UNREAD_KEY,
    queryFn: () => api<{ count: number }>('/admin/notifications/unread-count'),
    select: (d) => d.count,
    refetchInterval: 120_000,
  })
  const list = useInfiniteQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: ({ pageParam }) => api<AdminNotificationPage>(`/admin/notifications${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY })
  const readAll = useMutation({ mutationFn: () => send('POST', '/admin/notifications/read-all'), onSuccess: refresh })
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const count = unread.data ?? 0

  function openItem(n: AdminNotification) {
    if (!n.readAt) void send('POST', `/admin/notifications/${n.id}/read`).then(refresh)
    setOpen(false)
    if (n.data.link) navigate(n.data.link)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={count ? `${t.notifications.title} · ${fill(t.notifications.unread, { n: count })}` : t.notifications.title}>
          {count ? <BellRing className="size-5" /> : <Bell className="size-5" />}
          {count > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-bold text-white ring-2 ring-background">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] gap-0 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="font-semibold">{t.notifications.title}</p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={sound ? t.notifications.soundOff : t.notifications.soundOn}
              title={sound ? t.notifications.soundOff : t.notifications.soundOn}
              onClick={() => {
                setSoundEnabled(!sound)
                setSound(!sound)
              }}
            >
              {sound ? <Volume2 /> : <VolumeX />}
            </Button>
            <Button variant="ghost" size="sm" disabled={!count || readAll.isPending} onClick={() => readAll.mutate()}>
              <CheckCheck /> {t.notifications.markAllRead}
            </Button>
          </div>
        </div>
        <div className="max-h-[min(28rem,70svh)] overflow-y-auto">
          {list.isPending ? (
            <p className="flex justify-center py-10 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
            </p>
          ) : items.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t.notifications.empty}</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const text = notificationText({ ...n, i18n: n.data.i18n }, locale)
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)} className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted', !n.readAt && 'bg-primary/5')}>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        {n.type === 'SHOP_APPLICATION' ? <Store className="size-4" /> : <Bell className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm', !n.readAt ? 'font-semibold' : 'font-medium')}>{text.title}</span>
                        <span className="line-clamp-2 text-sm text-muted-foreground">{text.body}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{formatDate(n.createdAt, locale, true)}</span>
                      </span>
                      {!n.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-hidden />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          {list.hasNextPage && (
            <button type="button" onClick={() => void list.fetchNextPage()} className="w-full border-t py-2.5 text-sm font-medium text-primary hover:bg-muted">
              {list.isFetchingNextPage ? <LoaderCircle className="mx-auto size-4 animate-spin" /> : t.notifications.loadMore}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

import { Button } from '@talad/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@talad/ui/components/popover'
import { setSoundEnabled, soundEnabled } from '@talad/ui/lib/notify-sound'
import { cn } from '@talad/ui/lib/utils'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Heart, LoaderCircle, MessageCircle, ReceiptText, Store, Volume2, VolumeX, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PushToggle } from '@/components/push-toggle'
import { queryKeys } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatDate } from '@/lib/format'
import { notificationText } from '@/lib/realtime'
import type { InboxNotification, InboxPage } from '@/lib/types'

const ICONS: Record<string, LucideIcon> = { ORDER: ReceiptText, ACTIVITY: Heart, SHOP_STATUS: Store, MESSAGE: MessageCircle }

/** The top bar bell: unread badge, the latest notifications, mark all read, sound on/off. */
export function NotificationBell({ className }: { className?: string }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [sound, setSound] = useState(soundEnabled)
  const unread = useQuery({
    queryKey: queryKeys.notificationsUnread,
    queryFn: () => api<{ count: number }>('/me/shop/notifications/unread-count'),
    select: (d) => d.count,
    refetchInterval: 120_000,
  })
  const list = useInfiniteQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ pageParam }) => api<InboxPage>(`/me/shop/notifications${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: open,
  })
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.notifications })
  const readAll = useMutation({ mutationFn: () => send('POST', '/me/shop/notifications/read-all'), onSuccess: refresh })
  const items = list.data?.pages.flatMap((p) => p.items) ?? []
  const count = unread.data ?? 0

  function openItem(n: InboxNotification) {
    if (!n.readAt) void send('POST', `/me/shop/notifications/${n.id}/read`).then(refresh)
    setOpen(false)
    if (n.data.link) navigate(n.data.link)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={count ? `${t.nav.notifications} · ${fill(t.notifications.unread, { n: count })}` : t.nav.notifications} className={cn('relative', className)}>
          {/* The badge hangs off the bell's top-right corner, ringed in the bar's colour (green on phones). */}
          <span className="relative">
            <Bell className="size-5" />
            {count > 0 && (
              <span className="pointer-events-none absolute -top-2 -right-2.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] leading-none font-bold text-white tabular-nums ring-2 ring-primary md:ring-background">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </span>
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
                const Icon = ICONS[n.type] ?? Bell
                const text = notificationText({ ...n, i18n: n.data.i18n }, locale)
                return (
                  <li key={n.id}>
                    <button type="button" onClick={() => openItem(n)} className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted', !n.readAt && 'bg-brand-soft/50')}>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary">
                        <Icon className="size-4" />
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
        <PushToggle />
      </PopoverContent>
    </Popover>
  )
}

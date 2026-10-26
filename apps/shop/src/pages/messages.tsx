import { Button } from '@talad/ui/components/button'
import { Input } from '@talad/ui/components/input'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Camera, CheckCheck, CircleAlert, ImageIcon, LoaderCircle, Lock, MapPin, MessagesSquare, Package, Plus, Search, SendHorizontal, ShieldCheck, ShoppingBag, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link, useParams } from 'react-router'
import { SellerOrderCard, SendOrderDialog } from '@/components/chat-order'
import { LocationCard } from '@/components/location-card'
import { TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { queryKeys } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { ApiError, api, getToken, send } from '@/lib/api'
import { compressImage } from '@/lib/compress-image'
import { fill, formatMoney, storefrontUrl } from '@/lib/format'
import { MESSAGE_EVENT } from '@/lib/realtime'
import type { ChatMessage, ChatProductRef, ChatThread, ConversationSummary } from '@/lib/types'

const BASE = '/me/shop/conversations'
/** How often an open chat checks for new messages; the list refreshes less often. */
const THREAD_POLL_MS = 4000
const LIST_POLL_MS = 15_000
/** Messages from one side this close together read as one group (one time stamp). */
const GROUP_GAP_MS = 5 * 60_000

/** Soft avatar colours, picked from the name so a customer always gets the same one. */
const AVATAR_TONES = [
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
]

function Avatar({ name, className }: { name: string; className?: string }) {
  const hash = [...name].reduce((h, c) => (h * 31 + c.codePointAt(0)!) | 0, 0)
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold', AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length], className)}>
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/** Merge by id, oldest first (polling, sending and "load older" can overlap). */
function merge(a: ChatMessage[], b: ChatMessage[]): ChatMessage[] {
  const byId = new Map([...a, ...b].map((m) => [m.id, m]))
  return [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id))
}

/**
 * Private chats with customers (§3 "chat to shop"). Desktop: the list and the open chat side
 * by side. Phones: the list, then the chat as its own screen (/messages/:id).
 */
export function MessagesPage() {
  const { t } = useI18n()
  const { id } = useParams()
  const thread = useQuery({ queryKey: queryKeys.conversation(id ?? ''), queryFn: () => api<ChatThread>(`${BASE}/${id}`), enabled: !!id, staleTime: Infinity })

  return (
    <>
      <TopBar title={id && thread.data ? thread.data.customer.name : t.messages.title} backTo={id ? '/messages' : '/'} />
      {/* Exactly the screen under the top bar: the list and the chat scroll inside, never the page. */}
      <div className="flex h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden">
        <ConversationList activeId={id} className={cn('w-full md:w-80 md:shrink-0 md:border-r lg:w-96', id && 'max-md:hidden')} />
        <section className={cn('min-w-0 flex-1 flex-col bg-muted/30', id ? 'flex' : 'hidden md:flex')}>
          {id ? (
            <Thread key={id} id={id} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="mb-2 flex size-20 items-center justify-center rounded-full bg-brand-soft text-primary ring-8 ring-brand-soft/40">
                <MessagesSquare className="size-9" />
              </span>
              <p className="text-lg font-semibold">{t.messages.pickTitle}</p>
              <p className="max-w-xs text-sm text-muted-foreground">{t.messages.pick}</p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Lock className="size-3.5" />
                {t.messages.description}
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function ConversationList({ activeId, className }: { activeId?: string; className?: string }) {
  const { t, locale } = useI18n()
  const [q, setQ] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const search = q.trim()
  const list = useQuery({
    queryKey: [...queryKeys.conversations, 'list', search],
    queryFn: () => api<ConversationSummary[]>(`${BASE}${search ? `?q=${encodeURIComponent(search)}` : ''}`),
    refetchInterval: LIST_POLL_MS,
    placeholderData: keepPreviousData,
  })
  const time = new Intl.DateTimeFormat(locale === 'lo' ? 'lo-LA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  const date = new Intl.DateTimeFormat(locale === 'lo' ? 'lo-LA' : 'en-GB', { day: 'numeric', month: 'short' })
  const today = new Date().toDateString()
  const unreadChats = list.data?.filter((c) => c.unread > 0).length ?? 0
  const shown = onlyUnread ? list.data?.filter((c) => c.unread > 0) : list.data

  return (
    <aside className={cn('flex min-h-0 flex-col bg-card', className)}>
      <div className="flex flex-col gap-3 px-4 pt-4 pb-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.messages.search}
            aria-label={t.messages.search}
            className="h-10 rounded-full border-transparent bg-muted pl-10 shadow-none focus-visible:border-primary focus-visible:bg-background"
          />
        </div>
        <div className="flex gap-1.5" role="group">
          {([false, true] as const).map((unread) => (
            <button
              key={String(unread)}
              type="button"
              aria-pressed={onlyUnread === unread}
              onClick={() => setOnlyUnread(unread)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors',
                onlyUnread === unread ? 'bg-primary font-medium text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {unread ? t.messages.unreadOnly : t.messages.all}
              {unread && unreadChats > 0 && (
                <span className={cn('min-w-5 rounded-full px-1 text-center text-[11px] leading-5 font-bold', onlyUnread ? 'bg-primary-foreground/20' : 'bg-primary text-primary-foreground')}>
                  {unreadChats}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} className="m-2" />
        ) : list.data.length === 0 ? (
          search ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t.messages.noResults}</p>
          ) : (
            <EmptyState icon={MessagesSquare} title={t.messages.emptyTitle} body={t.messages.emptyBody} className="m-2" />
          )
        ) : shown!.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{t.messages.noUnread}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown!.map((c) => {
              const active = c.id === activeId
              const at = new Date(c.lastMessageAt)
              return (
                <li key={c.id}>
                  <Link
                    to={`/messages/${c.id}`}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 transition-colors',
                      active ? 'border-primary/30 bg-brand-soft' : 'bg-card hover:border-primary/20 hover:bg-muted/60',
                    )}
                  >
                    {active && <span className="absolute inset-y-2.5 left-0 w-1 rounded-full bg-primary" />}
                    <span className="relative">
                      <Avatar name={c.customer.name} className="size-11" />
                      {c.unread > 0 && <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-primary ring-2 ring-card" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate', c.unread ? 'font-bold' : 'font-medium')}>{c.customer.name}</span>
                        <span className={cn('shrink-0 text-[11px] tabular-nums', c.unread ? 'font-semibold text-primary' : 'text-muted-foreground')}>
                          {at.toDateString() === today ? time.format(at) : date.format(at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={cn('flex min-w-0 flex-1 items-center gap-1 text-sm', c.unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                          {c.lastMessage?.mine && <span className="shrink-0">{t.messages.you}:</span>}
                          {c.lastMessage?.photo ? (
                            <>
                              <ImageIcon className="size-4 shrink-0" /> {t.messages.photo}
                            </>
                          ) : c.lastMessage?.location ? (
                            <>
                              <MapPin className="size-4 shrink-0" /> {t.messages.location}
                            </>
                          ) : c.lastMessage?.order ? (
                            <>
                              <ShoppingBag className="size-4 shrink-0" /> {t.messages.orderPreview}
                            </>
                          ) : c.lastMessage?.product ? (
                            <>
                              <Package className="size-4 shrink-0" /> {t.messages.product}
                            </>
                          ) : (
                            <span className="truncate">{c.lastMessage?.text}</span>
                          )}
                        </span>
                        {c.unread > 0 && (
                          <span
                            aria-label={fill(t.messages.unread, { n: c.unread })}
                            className="min-w-5 shrink-0 rounded-full bg-primary px-1.5 text-center text-xs leading-5 font-bold text-primary-foreground"
                          >
                            {c.unread > 99 ? '99+' : c.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
  )
}

function Thread({ id }: { id: string }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const key = queryKeys.conversation(id)
  const thread = useQuery({ queryKey: key, queryFn: () => api<ChatThread>(`${BASE}/${id}`), staleTime: Infinity })
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null)
  /** The shop's current position, ready to send (e.g. where to pick up or meet). */
  const [place, setPlace] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<keyof typeof t.messages.errors | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const textInput = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [sendingOrder, setSendingOrder] = useState(false)
  /** The latest page again (merged): shows a card that was just sent or changed. */
  const reload = () => void api<ChatThread>(`${BASE}/${id}`).then((res) => addMessages(res.messages))
  const cancelOrder = useMutation({
    mutationFn: (orderId: string) => send('POST', `${BASE}/${id}/orders/${orderId}/cancel`),
    onSuccess: reload,
    onError: () => toast.error(t.chatOrder.errors.ORDER_CLOSED),
  })

  // Scroll only the message list: scrollIntoView would also scroll the page around it.
  const toBottom = () => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }

  /** A photo finished loading: stay at the bottom unless the seller has scrolled up to read. */
  const keepAtBottom = (img: HTMLImageElement) => {
    const el = scroller.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < img.offsetHeight + 160) toBottom()
  }

  const markRead = () =>
    void api(`${BASE}/${id}/read`, { method: 'POST' }).then(() => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadMessages })
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.conversations, 'list'] })
    })

  // New messages are merged into the cached thread, so earlier pages stay loaded.
  const addMessages = (messages: ChatMessage[], extra?: Partial<ChatThread>) =>
    queryClient.setQueryData<ChatThread>(key, (prev) => (prev ? { ...prev, ...extra, messages: merge(prev.messages, messages) } : prev))

  // Opening the chat marks it read; then poll for the customer's new messages while visible.
  useEffect(() => {
    markRead()
    let tick = 0
    const poll = (now = false) => {
      if (!now && document.visibilityState !== 'visible') return
      const current = queryClient.getQueryData<ChatThread>(key)?.messages
      const after = current?.at(-1)?.id
      // An order card waiting for the customer changes in place when they place it: refresh
      // the latest page now and then (merged, so earlier pages stay).
      const refresh = ++tick % 3 === 0 && current?.some((m) => m.order?.status === 'DRAFT')
      void api<ChatThread>(`${BASE}/${id}${after && !refresh ? `?after=${after}` : ''}`)
        .then((res) => {
          // The customer may have read the chat since: refresh the ticks even without new messages.
          queryClient.setQueryData<ChatThread>(key, (prev) => (prev && prev.otherReadAt !== res.otherReadAt ? { ...prev, otherReadAt: res.otherReadAt } : prev))
          if (!res.messages.length) return
          addMessages(res.messages)
          if (res.messages.some((m) => !m.mine)) markRead()
        })
        .catch(() => {})
    }
    const timer = window.setInterval(() => poll(), THREAD_POLL_MS)
    // A live "new message" event: fetch it now instead of waiting for the next poll.
    const onMessage = (e: Event) => (e as CustomEvent<string>).detail === id && poll(true)
    window.addEventListener(MESSAGE_EVENT, onMessage)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener(MESSAGE_EVENT, onMessage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one poller per open chat (`id`)
  }, [id])

  const messages = thread.data?.messages
  const newest = messages?.at(-1)?.id
  useEffect(() => {
    toBottom()
  }, [newest])

  async function loadOlder() {
    const first = messages?.[0]
    if (!first || loadingOlder) return
    setLoadingOlder(true)
    try {
      const res = await api<ChatThread>(`${BASE}/${id}?before=${first.id}`)
      addMessages(res.messages, { hasMore: res.hasMore })
    } finally {
      setLoadingOlder(false)
    }
  }

  const sendMessage = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.set('text', text.trim())
      if (photo) form.set('photo', photo.file)
      if (place) {
        form.set('latitude', String(place.lat))
        form.set('longitude', String(place.lng))
      }
      return api<ChatMessage>(`${BASE}/${id}/messages`, { method: 'POST', body: form })
    },
    onMutate: () => setError(null),
    onSuccess: (message) => {
      addMessages([message])
      setText('')
      if (textInput.current) textInput.current.style.height = 'auto'
      if (photo) URL.revokeObjectURL(photo.preview)
      setPhoto(null)
      setPlace(null)
      void queryClient.invalidateQueries({ queryKey: [...queryKeys.conversations, 'list'] })
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined
      setError(code && code in t.messages.errors ? (code as keyof typeof t.messages.errors) : 'generic')
    },
  })

  function submit() {
    if ((!text.trim() && !photo && !place) || sendMessage.isPending) return
    sendMessage.mutate()
  }

  /** Asks the browser for the current position; it's then sent like a photo. */
  function locate() {
    if (!('geolocation' in navigator)) return setError('LOCATION_UNAVAILABLE')
    setError(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      (err) => {
        setLocating(false)
        setError(err.code === err.PERMISSION_DENIED ? 'LOCATION_DENIED' : 'LOCATION_UNAVAILABLE')
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  }

  async function attach(file: File | undefined) {
    if (!file) return
    const small = await compressImage(file, { maxSide: 1600, maxBytes: 900 * 1024 })
    if (photo) URL.revokeObjectURL(photo.preview)
    setPhoto({ file: small, preview: URL.createObjectURL(small) })
    textInput.current?.focus()
  }

  if (thread.isPending) return <LoadingState className="flex-1" />
  if (thread.isError) return <ErrorState onRetry={() => void thread.refetch()} className="m-4" />
  const data = thread.data
  // A card sent again (the bot brings back the same order) shows once, at its latest message.
  const lastOfOrder = new Map(data.messages.flatMap((m) => (m.order ? [[m.order.id, m.id] as const] : [])))
  const time = new Intl.DateTimeFormat(locale === 'lo' ? 'lo-LA' : 'en-GB', { hour: '2-digit', minute: '2-digit' })
  const day = new Intl.DateTimeFormat(locale === 'lo' ? 'lo-LA' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <>
      {/* Desktop header (phones show the name in the top bar). */}
      <div className="hidden items-center gap-3 border-b bg-card px-5 py-3 md:flex">
        <Avatar name={data.customer.name} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{data.customer.name}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" /> {t.messages.privateShort}
          </p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setSendingOrder(true)}>
          <ShoppingBag />
          {t.chatOrder.send}
        </Button>
      </div>

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-5 md:px-8"
        style={{ backgroundImage: 'radial-gradient(color-mix(in oklab, var(--border) 70%, transparent) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        aria-live="polite"
      >
        <p className="mx-auto mb-5 flex w-fit max-w-[90%] items-center gap-1.5 rounded-full bg-card/90 px-3.5 py-1.5 text-center text-xs text-muted-foreground shadow-sm ring-1 ring-border backdrop-blur">
          <Lock className="size-3.5 shrink-0 text-amber-600" />
          {fill(t.messages.private, { name: data.customer.name })}
        </p>
        {data.hasMore && (
          <Button variant="outline" size="sm" className="mx-auto mb-4 flex rounded-full bg-card" onClick={() => void loadOlder()} disabled={loadingOlder}>
            {loadingOlder && <LoaderCircle className="animate-spin" />}
            {t.messages.loadOlder}
          </Button>
        )}
        <ol className="mx-auto flex max-w-3xl flex-col">
          {data.messages.map((m, i) => {
            const prev = data.messages[i - 1]
            const next = data.messages[i + 1]
            const date = new Date(m.createdAt)
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== date.toDateString()
            // Runs of messages from one side read as a group: one avatar, one time stamp.
            const sameSide = (a?: ChatMessage, b?: ChatMessage) =>
              !!a && !!b && a.mine === b.mine && a.bot === b.bot && new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() < GROUP_GAP_MS && new Date(a.createdAt).toDateString() === new Date(b.createdAt).toDateString()
            const first = !sameSide(prev, m)
            const last = !sameSide(m, next)
            const showOrder = m.order && lastOfOrder.get(m.order.id) === m.id
            if (m.system) {
              // Taladonline speaking to both sides: centred, not anyone's bubble.
              return (
                <li key={m.id} className="mt-4 flex flex-col">
                  {newDay && (
                    <p className="mb-3 flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />
                      <span className="rounded-full bg-card px-3 py-1 shadow-sm ring-1 ring-border">{day.format(date)}</span>
                      <span className="h-px flex-1 bg-border" />
                    </p>
                  )}
                  <div className="mx-auto w-full max-w-md rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                      <ShieldCheck className="size-4" />
                      Taladonline
                    </p>
                    <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
                  </div>
                </li>
              )
            }
            return (
              <li key={m.id} className={cn('flex flex-col', first ? 'mt-4' : 'mt-1')}>
                {newDay && (
                  <p className="mb-3 flex items-center gap-3 text-[11px] font-medium text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    <span className="rounded-full bg-card px-3 py-1 shadow-sm ring-1 ring-border">{day.format(date)}</span>
                    <span className="h-px flex-1 bg-border" />
                  </p>
                )}
                <div className={cn('flex items-end gap-2', m.mine ? 'justify-end pl-[12%]' : 'pr-[12%]')}>
                  {/* The customer's avatar sits beside the last message of a run. */}
                  {!m.mine && (last ? <Avatar name={data.customer.name} className="mb-5 size-8 text-xs" /> : <span className="w-8 shrink-0" />)}
                  <div className={cn('flex min-w-0 flex-col gap-1.5', m.mine ? 'items-end' : 'items-start')}>
                    {m.bot && first && (
                      <Link to="/chatbot" className="flex items-center gap-1 rounded-full bg-card px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border hover:text-primary">
                        <Bot className="size-3.5 text-primary" />
                        {t.messages.autoReply}
                      </Link>
                    )}
                    {m.location && <LocationCard lat={m.location.lat} lng={m.location.lng} label={t.messages.locationTitle} open={t.messages.openMap} />}
                    {m.product && (
                      <a
                        href={storefrontUrl.product(locale, m.product.shopSlug, m.product.slug)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-72 max-w-full items-center gap-3 rounded-2xl bg-card p-2.5 pr-3.5 shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
                      >
                        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
                          {m.product.imageUrl ? <img src={m.product.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[11px] font-medium text-primary">{t.messages.askedAbout}</span>
                          <span className="line-clamp-2 text-sm leading-snug font-medium">{m.product.name}</span>
                          <span className="text-sm font-semibold tabular-nums">{formatMoney(m.product.price, locale)}</span>
                        </span>
                      </a>
                    )}
                    {m.hasPhoto && <MessagePhoto path={`${BASE}/${id}/messages/${m.id}/photo`} alt={t.messages.photo} onLoad={keepAtBottom} />}
                    {m.text && (
                      <p
                        className={cn(
                          'w-fit max-w-full rounded-[1.25rem] px-4 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap',
                          m.mine
                            ? cn(
                                'shadow-sm',
                                m.bot ? 'bg-brand-soft text-foreground ring-1 ring-primary/20' : 'bg-gradient-to-br from-primary to-[color-mix(in_oklab,var(--primary)_80%,black)] text-primary-foreground',
                                !first && 'rounded-tr-md',
                                !last && 'rounded-br-md',
                                last && 'rounded-br-sm',
                              )
                            : cn('bg-card text-foreground shadow-sm ring-1 ring-border', !first && 'rounded-tl-md', !last && 'rounded-bl-md', last && 'rounded-bl-sm'),
                        )}
                      >
                        {m.text}
                      </p>
                    )}
                    {showOrder && <SellerOrderCard order={m.order!} onCancel={m.order!.status === 'DRAFT' ? () => cancelOrder.mutate(m.order!.id) : undefined} />}
                    {m.products.length > 0 && <BotProducts products={m.products} align={m.mine ? 'end' : 'start'} />}
                    {last && (
                      <span className="flex items-center gap-1 px-1.5 text-[10px] text-muted-foreground tabular-nums">
                        {time.format(date)}
                        {m.mine && <ReadTicks read={!!data.otherReadAt && data.otherReadAt >= m.createdAt} />}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
        <div ref={end} className="h-1" />
      </div>

      {sendingOrder && <SendOrderDialog conversationId={id} customerName={data.customer.name} onClose={() => setSendingOrder(false)} onSent={reload} />}
      <div className="border-t bg-card px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-8 md:pb-3">
        {error && (
          <p role="alert" className="mx-auto mb-2 flex max-w-3xl items-center gap-1.5 text-sm text-destructive">
            <CircleAlert className="size-4 shrink-0" />
            {t.messages.errors[error]}
          </p>
        )}
        <form
          className="mx-auto max-w-3xl rounded-2xl border bg-background p-1.5 transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {place && (
            <div className="relative m-1.5 mb-1 flex w-fit items-center gap-2 rounded-xl bg-muted py-2 pr-9 pl-3 text-sm font-medium">
              <MapPin className="size-4 shrink-0 text-red-500" />
              {t.messages.locationReady}
              <button
                type="button"
                onClick={() => setPlace(null)}
                aria-label={t.messages.removeLocation}
                className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-background"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          {photo && (
            <div className="relative m-1.5 mb-1 w-fit">
              <img src={photo.preview} alt="" className="size-20 rounded-xl object-cover ring-1 ring-border" />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(photo.preview)
                  setPhoto(null)
                }}
                aria-label={t.messages.removePhoto}
                className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-1">
            <button
              type="button"
              onClick={() => setSendingOrder(true)}
              aria-label={t.chatOrder.send}
              title={t.chatOrder.send}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary md:hidden"
            >
              <ShoppingBag className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label={t.messages.attach}
              title={t.messages.attach}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary"
            >
              {photo ? <Plus className="size-5" /> : <Camera className="size-5" />}
            </button>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              aria-label={t.messages.shareLocation}
              title={t.messages.shareLocation}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-brand-soft hover:text-primary disabled:opacity-60"
            >
              {locating ? <LoaderCircle className="size-5 animate-spin" /> : <MapPin className="size-5" />}
            </button>
            <textarea
              ref={textInput}
              rows={1}
              value={text}
              maxLength={2000}
              placeholder={t.messages.placeholder}
              aria-label={t.messages.placeholder}
              onChange={(e) => {
                setText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  submit()
                }
              }}
              className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={sendMessage.isPending || (!text.trim() && !photo && !place)}
              aria-label={t.messages.send}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              {sendMessage.isPending ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              void attach(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </form>
        <p className="mx-auto mt-1.5 hidden max-w-3xl px-2 text-[11px] text-muted-foreground md:block">{t.messages.enterHint}</p>
      </div>
    </>
  )
}

/** Double check after the shop's messages: gray until the customer opens the chat, then green. */
function ReadTicks({ read }: { read: boolean }) {
  const { t } = useI18n()
  const label = read ? t.messages.read : t.messages.delivered
  return (
    <span title={label} className={cn('relative', read ? 'text-primary' : 'text-muted-foreground/70')}>
      <CheckCheck className="size-3.5" strokeWidth={2.25} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** A private message photo: fetched with the session token (an <img> can't send it), shown as a blob URL. */
function MessagePhoto({ path, alt, onLoad }: { path: string; alt: string; onLoad: (img: HTMLImageElement) => void }) {
  const photo = useQuery({
    queryKey: ['message-photo', path],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return URL.createObjectURL(await res.blob())
    },
    staleTime: Infinity,
    gcTime: Infinity,
  })
  if (!photo.data) return <span className="flex h-40 w-48 items-center justify-center rounded-2xl bg-muted text-muted-foreground">{photo.isError ? <ImageIcon className="size-6" /> : <LoaderCircle className="size-5 animate-spin" />}</span>
  return (
    <a href={photo.data} target="_blank" rel="noreferrer">
      <img src={photo.data} alt={alt} onLoad={(e) => onLoad(e.currentTarget)} className="max-h-64 w-auto max-w-[min(16rem,100%)] rounded-2xl bg-muted object-cover shadow-sm" />
    </a>
  )
}

/** Products the bot showed under its reply (open on the storefront). */
export function BotProducts({ products, align = 'start' }: { products: ChatProductRef[]; align?: 'start' | 'end' }) {
  const { locale } = useI18n()
  return (
    <ul className={cn('flex max-w-full flex-wrap gap-2', align === 'end' && 'justify-end')}>
      {products.map((p) => (
        <li key={p.id} className="flex w-36 min-w-0">
          <a
            href={storefrontUrl.product(locale, p.shopSlug, p.slug)}
            target="_blank"
            rel="noreferrer"
            className="group flex w-full min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
          >
            <span className="flex aspect-square items-center justify-center overflow-hidden bg-muted text-muted-foreground">
              {p.imageUrl ? <img src={p.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" /> : <Package className="size-6" />}
            </span>
            <span className="flex flex-col gap-0.5 px-2.5 py-2">
              <span className="line-clamp-2 text-xs leading-snug font-medium">{p.name}</span>
              <span className="text-sm font-semibold text-primary tabular-nums">{formatMoney(p.price, locale)}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

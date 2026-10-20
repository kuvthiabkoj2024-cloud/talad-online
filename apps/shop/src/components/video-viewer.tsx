import { Button } from '@talad/ui/components/button'
import { cn } from '@talad/ui/lib/utils'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Heart,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Play,
  SendHorizontal,
  Share2,
  Store,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ProductStatusBadge } from '@/components/status-badge'
import { queryKeys, useMyShop } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatMoney, formatNumber, storefrontUrl } from '@/lib/format'
import type { ShopVideo, VideoComment, VideoCommentPage, VideoLikePage } from '@/lib/types'

const BASE = '/me/shop/videos'
type Tab = 'comments' | 'likes'

/** "12k" style counts on the action rail. */
function compact(n: number, locale: 'lo' | 'en') {
  return new Intl.NumberFormat(locale === 'lo' ? 'lo-LA' : 'en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function useTimeAgo() {
  const { t, locale } = useI18n()
  const rtf = new Intl.RelativeTimeFormat(locale === 'lo' ? 'lo-LA' : 'en-GB', { numeric: 'auto', style: 'short' })
  return (iso: string) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000
    if (s < 60) return t.videos.viewer.justNow
    if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute')
    if (s < 86_400) return rtf.format(-Math.floor(s / 3600), 'hour')
    if (s < 30 * 86_400) return rtf.format(-Math.floor(s / 86_400), 'day')
    return new Date(iso).toLocaleDateString(locale === 'lo' ? 'lo-LA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
}

function Avatar({ name, src, className }: { name: string; src: string | null; className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-semibold text-primary', className)}>
      {src ? <img src={src} alt="" className="size-full object-cover" /> : name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/**
 * Full-screen, TikTok-style player for the shop's videos: swipe/scroll or arrow keys between
 * them, the action rail (likes, comments, shares, views), and a side panel (a bottom sheet on
 * phones) with the comments — answered as the shop — and who liked the video.
 */
export function VideoViewer({ videos, index, onIndex, onClose }: { videos: ShopVideo[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const { t, locale } = useI18n()
  const v = t.videos.viewer
  const video = videos[index]
  const { data: shop } = useMyShop()
  const [muted, setMuted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [tab, setTab] = useState<Tab>('comments')
  // Phones: the panel is a sheet opened from the rail. Desktop: always beside the video.
  const [sheet, setSheet] = useState(false)
  const player = useRef<HTMLVideoElement>(null)
  const lastWheel = useRef(0)
  const touchY = useRef(0)

  const go = (delta: number) => {
    const next = index + delta
    if (next >= 0 && next < videos.length) onIndex(next)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowDown') go(1)
      else if (e.key === 'ArrowUp') go(-1)
      else if (e.key === ' ') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  })

  // Each video is its own <video> (keyed), so it starts from the beginning; the overlay follows its events.
  function toggle() {
    const el = player.current
    if (!el) return
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  }

  function share() {
    if (!shop) return
    void navigator.clipboard.writeText(storefrontUrl.product(locale, shop.slug, video.slug)).then(() => toast.success(v.linkCopied))
  }

  const openPanel = (next: Tab) => {
    setTab(next)
    setSheet(true)
  }

  if (!video) return null
  const rail = [
    { key: 'likes', icon: Heart, label: t.videos.likes, n: video.likes, onClick: () => openPanel('likes'), active: tab === 'likes' },
    { key: 'comments', icon: MessageCircle, label: t.videos.comments, n: video.comments, onClick: () => openPanel('comments'), active: tab === 'comments' },
    { key: 'shares', icon: Share2, label: t.videos.shares, n: video.shares, onClick: share, title: fill(v.sharesHint, { n: video.shares }) },
    { key: 'views', icon: Eye, label: t.videos.views, n: video.views },
  ]

  return (
    <div role="dialog" aria-modal="true" aria-label={video.name} className="fixed inset-0 z-50 flex bg-black text-white">
      {/* The stage: blurred cover behind, the 9:16 video in the middle. */}
      <div
        className="relative flex min-w-0 flex-1 items-center justify-center overflow-hidden"
        onWheel={(e) => {
          if (Math.abs(e.deltaY) < 30 || Date.now() - lastWheel.current < 600) return
          lastWheel.current = Date.now()
          go(e.deltaY > 0 ? 1 : -1)
        }}
        onTouchStart={(e) => (touchY.current = e.touches[0].clientY)}
        onTouchEnd={(e) => {
          const dy = touchY.current - e.changedTouches[0].clientY
          if (Math.abs(dy) > 60) go(dy > 0 ? 1 : -1)
        }}
      >
        {video.imageUrl && <img src={video.imageUrl} alt="" className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-2xl" />}
        <div className="relative h-full max-h-svh w-full sm:aspect-[9/16] sm:h-[calc(100svh-2rem)] sm:w-auto sm:overflow-hidden sm:rounded-2xl sm:shadow-2xl">
          <video
            key={video.productId}
            ref={player}
            src={video.videoUrl}
            poster={video.imageUrl ?? undefined}
            muted={muted}
            loop
            playsInline
            autoPlay
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            // Autoplay can be refused (e.g. with sound before any tap): show the play button.
            onLoadedData={(e) => setPaused(e.currentTarget.paused)}
            onClick={toggle}
            className="size-full cursor-pointer bg-black object-cover"
          />
          {paused && (
            <button type="button" onClick={toggle} aria-label={v.play} className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-black/40 backdrop-blur">
                <Play className="ml-1 size-8 fill-current" />
              </span>
            </button>
          )}

          {/* Bottom: what's in the video. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pt-16 pb-5 pr-20">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Avatar name={shop?.name ?? ''} src={shop?.logoUrl ?? null} className="size-7 text-xs ring-2 ring-white/70" />
              {shop?.name}
            </p>
            <Link to={`/products/${video.productId}`} className="pointer-events-auto mt-2 line-clamp-2 text-[15px] font-medium hover:underline">
              {video.name}
            </Link>
            <p className="mt-1 flex items-center gap-2 text-sm">
              <span className="font-bold">{formatMoney(video.price, locale)}</span>
              <ProductStatusBadge status={video.status} className="bg-white/90" />
            </p>
            <div className="pointer-events-auto mt-3 flex flex-wrap gap-2">
              <Link to={`/products/${video.productId}`} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur transition hover:bg-white/25">
                <Pencil className="size-3.5" />
                {v.editProduct}
              </Link>
              {shop && video.status === 'PUBLISHED' && (
                <a
                  href={storefrontUrl.product(locale, shop.slug, video.slug)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur transition hover:bg-white/25"
                >
                  <Store className="size-3.5" />
                  {v.viewOnStore}
                </a>
              )}
            </div>
          </div>

          {/* Right: the TikTok-style action rail. */}
          <div className="absolute right-2 bottom-24 flex flex-col items-center gap-4">
            {rail.map(({ key, icon: Icon, label, n, onClick, title, active }) => {
              const body = (
                <>
                  <span className={cn('flex size-11 items-center justify-center rounded-full bg-black/35 backdrop-blur transition', onClick && 'group-hover:bg-black/55', active && 'lg:bg-white/25')}>
                    <Icon className={cn('size-6', key === 'likes' && n > 0 && 'fill-rose-500 text-rose-500')} />
                  </span>
                  <span className="text-xs font-semibold tabular-nums drop-shadow">{compact(n, locale)}</span>
                </>
              )
              return onClick ? (
                <button key={key} type="button" onClick={onClick} title={title ?? label} aria-label={`${label}: ${n}`} className="group flex flex-col items-center gap-1">
                  {body}
                </button>
              ) : (
                <span key={key} title={label} aria-label={`${label}: ${n}`} className="flex flex-col items-center gap-1">
                  {body}
                </span>
              )
            })}
          </div>
        </div>

        {/* Top: close and sound. */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <button type="button" onClick={onClose} aria-label={v.close} className="flex size-10 items-center justify-center rounded-full bg-black/40 backdrop-blur transition hover:bg-black/60">
            <X className="size-5" />
          </button>
          <span className="rounded-full bg-black/40 px-3 py-1 text-xs font-medium tabular-nums backdrop-blur">
            {index + 1} / {videos.length}
          </span>
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? v.unmute : v.mute}
            className="flex size-10 items-center justify-center rounded-full bg-black/40 backdrop-blur transition hover:bg-black/60"
          >
            {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
          </button>
        </div>

        {/* Desktop: up / down between videos. */}
        <div className="absolute top-1/2 right-4 hidden -translate-y-1/2 flex-col gap-3 sm:flex">
          <button type="button" onClick={() => go(-1)} disabled={index === 0} aria-label={v.prev} className="flex size-11 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25 disabled:opacity-30">
            <ChevronUp className="size-6" />
          </button>
          <button type="button" onClick={() => go(1)} disabled={index === videos.length - 1} aria-label={v.next} className="flex size-11 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25 disabled:opacity-30">
            <ChevronDown className="size-6" />
          </button>
        </div>
      </div>

      {/* Panel: beside the video on large screens, a bottom sheet on phones. */}
      {sheet && <button type="button" aria-label={v.close} onClick={() => setSheet(false)} className="fixed inset-0 z-10 bg-black/40 lg:hidden" />}
      <aside
        className={cn(
          'z-20 flex flex-col bg-card text-foreground',
          'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:h-[72svh] max-lg:rounded-t-3xl max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-300',
          sheet ? 'max-lg:translate-y-0' : 'max-lg:translate-y-full',
          'lg:w-[420px] lg:shrink-0 lg:border-l',
        )}
      >
        <VideoPanel key={video.productId} video={video} tab={tab} onTab={setTab} onClose={() => setSheet(false)} />
      </aside>
    </div>
  )
}

function VideoPanel({ video, tab, onTab, onClose }: { video: ShopVideo; tab: Tab; onTab: (t: Tab) => void; onClose: () => void }) {
  const { t, locale } = useI18n()
  const v = t.videos.viewer
  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'comments', label: v.commentsTab, n: video.comments },
    { key: 'likes', label: v.likesTab, n: video.likes },
  ]
  return (
    <>
      <div className="flex items-center gap-2 border-b px-4 pt-3">
        <span className="absolute top-2 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/30 lg:hidden" />
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            onClick={() => onTab(x.key)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
              tab === x.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {x.key === 'comments' ? <MessageCircle className="size-4" /> : <Heart className="size-4" />}
            {x.label}
            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">{formatNumber(x.n, locale)}</span>
          </button>
        ))}
        <button type="button" onClick={onClose} aria-label={v.close} className="ml-auto flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted lg:hidden">
          <X className="size-4" />
        </button>
      </div>
      {tab === 'comments' ? <CommentsTab video={video} /> : <LikesTab video={video} />}
    </>
  )
}

function LikesTab({ video }: { video: ShopVideo }) {
  const { t } = useI18n()
  const v = t.videos.viewer
  const ago = useTimeAgo()
  const likes = useInfiniteQuery({
    queryKey: [...queryKeys.videos, video.productId, 'likes'],
    queryFn: ({ pageParam }) => api<VideoLikePage>(`${BASE}/${video.productId}/likes?limit=30${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const items = likes.data?.pages.flatMap((p) => p.items) ?? []

  if (likes.isPending) return <PanelLoading />
  if (items.length === 0) return <PanelEmpty icon={Heart} title={v.noLikes} body={v.noLikesBody} />
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
      <ul className="flex flex-col">
        {items.map((l) => (
          <li key={l.customer.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted/60">
            <span className="relative">
              <Avatar name={l.customer.name} src={l.customer.avatarUrl} className="size-10" />
              <span className="absolute -right-0.5 -bottom-0.5 flex size-4.5 items-center justify-center rounded-full bg-rose-500 ring-2 ring-card">
                <Heart className="size-2.5 fill-white text-white" />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{l.customer.name}</span>
              <span className="block text-xs text-muted-foreground">{v.likedYour}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">{ago(l.createdAt)}</span>
          </li>
        ))}
      </ul>
      {likes.hasNextPage && <LoadMore pending={likes.isFetchingNextPage} onClick={() => void likes.fetchNextPage()} />}
    </div>
  )
}

function CommentsTab({ video }: { video: ShopVideo }) {
  const { t } = useI18n()
  const v = t.videos.viewer
  const queryClient = useQueryClient()
  const { data: shop } = useMyShop()
  const key = [...queryKeys.videos, video.productId, 'comments']
  const comments = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => api<VideoCommentPage>(`${BASE}/${video.productId}/comments?limit=20${pageParam ? `&cursor=${pageParam}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const [replyTo, setReplyTo] = useState<{ threadId: string; name: string } | null>(null)
  const [text, setText] = useState('')
  /** Replies loaded per thread (and threads the shop just answered). */
  const [replies, setReplies] = useState<Record<string, { items: VideoComment[]; cursor: string | null; open: boolean }>>({})
  const input = useRef<HTMLTextAreaElement>(null)
  const items = comments.data?.pages.flatMap((p) => p.items) ?? []

  const refreshCounts = () => void queryClient.invalidateQueries({ queryKey: [...queryKeys.videos, 'list'] })

  async function loadReplies(threadId: string) {
    const cur = replies[threadId]
    const page = await api<VideoCommentPage>(`${BASE}/${video.productId}/comments/${threadId}/replies?limit=20${cur?.cursor ? `&cursor=${cur.cursor}` : ''}`)
    setReplies((r) => {
      const known = new Set((r[threadId]?.items ?? []).map((c) => c.id))
      return { ...r, [threadId]: { items: [...(r[threadId]?.items ?? []), ...page.items.filter((c) => !known.has(c.id))], cursor: page.nextCursor, open: true } }
    })
  }

  const post = useMutation({
    mutationFn: () => send<VideoComment>('POST', `${BASE}/${video.productId}/comments`, { body: text.trim(), ...(replyTo && { parentId: replyTo.threadId }) }),
    onSuccess: (c) => {
      setText('')
      if (input.current) input.current.style.height = 'auto'
      if (c.parentId) {
        const threadId = c.parentId
        setReplies((r) => ({ ...r, [threadId]: { items: [...(r[threadId]?.items ?? []), c], cursor: r[threadId]?.cursor ?? null, open: true } }))
        queryClient.setQueryData(key, (old: typeof comments.data) =>
          old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === threadId ? { ...x, replyCount: x.replyCount + 1 } : x)) })) },
        )
        toast.success(v.sent)
      } else {
        queryClient.setQueryData(key, (old: typeof comments.data) => old && { ...old, pages: old.pages.map((p, i) => (i === 0 ? { ...p, items: [c, ...p.items] } : p)) })
      }
      setReplyTo(null)
      refreshCounts()
    },
    onError: () => toast.error(v.error),
  })

  const remove = useMutation({
    mutationFn: (c: VideoComment) => send('DELETE', `${BASE}/comments/${c.id}`),
    onSuccess: (_, c) => {
      toast.success(v.deleted)
      if (c.parentId) {
        const threadId = c.parentId
        setReplies((r) => ({ ...r, [threadId]: { ...r[threadId], items: r[threadId].items.filter((x) => x.id !== c.id) } }))
      }
      void queryClient.invalidateQueries({ queryKey: key })
      refreshCounts()
    },
    onError: () => toast.error(t.common.saveError),
  })

  const startReply = (c: VideoComment) => {
    setReplyTo({ threadId: c.parentId ?? c.id, name: c.author.name })
    input.current?.focus()
  }

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {comments.isPending ? (
          <PanelLoading />
        ) : items.length === 0 ? (
          <PanelEmpty icon={MessageCircle} title={v.noComments} body={v.noCommentsBody} />
        ) : (
          <ul className="flex flex-col gap-5">
            {items.map((c) => {
              const thread = replies[c.id]
              const shown = thread?.open ? thread.items : []
              const hidden = c.replyCount - shown.length
              return (
                <li key={c.id} className="flex flex-col gap-3">
                  <CommentRow comment={c} onReply={() => startReply(c)} onDelete={() => remove.mutate(c)} />
                  {(shown.length > 0 || c.replyCount > 0) && (
                    <div className="ml-12 flex flex-col gap-3">
                      {shown.map((r) => (
                        <CommentRow key={r.id} comment={r} small onReply={() => startReply(r)} onDelete={() => remove.mutate(r)} />
                      ))}
                      <div className="flex items-center gap-3 text-xs font-semibold text-muted-foreground">
                        <span className="h-px w-6 bg-border" />
                        {hidden > 0 && (!thread?.open || thread.cursor) ? (
                          <button type="button" onClick={() => void loadReplies(c.id)} className="hover:text-foreground">
                            {thread?.open ? v.moreReplies : hidden === 1 ? v.viewReply : fill(v.viewReplies, { n: hidden })}
                          </button>
                        ) : (
                          thread?.open &&
                          shown.length > 0 && (
                            <button type="button" onClick={() => setReplies((r) => ({ ...r, [c.id]: { ...r[c.id], open: false, items: [], cursor: null } }))} className="hover:text-foreground">
                              {v.hideReplies}
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {comments.hasNextPage && <LoadMore pending={comments.isFetchingNextPage} onClick={() => void comments.fetchNextPage()} />}
      </div>

      {/* Composer: the shop comments or answers as itself. */}
      <form
        className="border-t px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim() && !post.isPending) post.mutate()
        }}
      >
        {replyTo && (
          <p className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-brand-soft px-3 py-1.5 text-xs text-primary">
            <span className="truncate font-medium">{fill(v.replyingTo, { name: replyTo.name })}</span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label={v.cancelReply} className="shrink-0 hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </p>
        )}
        <div className="flex items-end gap-2">
          <Avatar name={shop?.name ?? ''} src={shop?.logoUrl ?? null} className="mb-1 size-8 text-xs" />
          <div className="flex min-w-0 flex-1 items-end gap-1 rounded-2xl border bg-background p-1 pl-3 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15">
            <textarea
              ref={input}
              rows={1}
              value={text}
              maxLength={500}
              placeholder={v.placeholder}
              onChange={(e) => {
                setText(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  if (text.trim() && !post.isPending) post.mutate()
                }
              }}
              className="max-h-28 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={!text.trim() || post.isPending}
              aria-label={v.send}
              className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              {post.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

function CommentRow({ comment: c, small, onReply, onDelete }: { comment: VideoComment; small?: boolean; onReply: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  const v = t.videos.viewer
  const ago = useTimeAgo()
  const deleted = c.body === null
  return (
    <div className="group flex gap-3">
      <Avatar name={c.author.name} src={c.author.avatarUrl} className={cn(small ? 'size-7 text-xs' : 'size-9', c.author.isShop && 'ring-2 ring-primary/30')} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs">
          <span className="truncate font-semibold">{c.author.name}</span>
          {c.author.isShop && <span className="shrink-0 rounded bg-primary px-1.5 text-[10px] leading-4 font-bold text-primary-foreground uppercase">{v.shopBadge}</span>}
          <span className="shrink-0 text-muted-foreground">· {ago(c.createdAt)}</span>
        </p>
        <p className={cn('mt-0.5 text-sm break-words whitespace-pre-line', deleted && 'text-muted-foreground italic')}>{deleted ? v.deletedBody : c.body}</p>
        {!deleted && (
          <div className="mt-1 flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            <button type="button" onClick={onReply} className="hover:text-primary">
              {v.reply}
            </button>
            <button type="button" onClick={onDelete} className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive focus-visible:opacity-100 max-lg:opacity-100">
              <Trash2 className="size-3.5" />
              {v.delete}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PanelLoading() {
  return (
    <div className="flex flex-1 items-center justify-center py-12 text-muted-foreground">
      <LoaderCircle className="size-6 animate-spin" />
    </div>
  )
}

function PanelEmpty({ icon: Icon, title, body }: { icon: typeof Heart; title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-primary">
        <Icon className="size-6" />
      </span>
      <p className="font-semibold">{title}</p>
      <p className="max-w-60 text-sm text-muted-foreground">{body}</p>
    </div>
  )
}

function LoadMore({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  const { t } = useI18n()
  return (
    <Button variant="outline" size="sm" className="mx-auto mt-4 flex rounded-full" disabled={pending} onClick={onClick}>
      {pending && <LoaderCircle className="animate-spin" />}
      {t.videos.viewer.loadMore}
    </Button>
  )
}

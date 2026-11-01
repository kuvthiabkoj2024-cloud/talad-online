import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Heart, MessageCircle, Play, Share2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FlagBadge, ProductStatusBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { FilterTabs, Pager } from '@/components/list-controls'
import { ErrorState, LoadingState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatDate, formatNumber } from '@/lib/format'
import type { AdminVideo, AdminVideoComment, AdminVideoLike, Paged } from '@/lib/types'

const KEY = ['admin', 'videos'] as const

/** Videos as tiles; opening one shows who engaged with it and lets an admin hide it. */
export function VideoGrid({ videos }: { videos: AdminVideo[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  // The list refreshes after hiding, so the open video follows the latest data.
  const open = videos.find((v) => v.id === openId) ?? null
  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {videos.map((v) => (
          <li key={v.id}>
            <VideoTile video={v} onOpen={() => setOpenId(v.id)} />
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">{open && <VideoDetail key={open.id} video={open} />}</DialogContent>
      </Dialog>
    </>
  )
}

function VideoTile({ video: v, onOpen }: { video: AdminVideo; onOpen: () => void }) {
  const { t, locale } = useI18n()
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={fill(t.videos.open, { name: v.title || v.owner.name })}
      className="group flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-md"
    >
      <span className="relative block aspect-[9/16] w-full overflow-hidden bg-black">
        <video src={v.videoUrl} poster={v.posterUrl ?? undefined} muted playsInline preload="metadata" className={`size-full object-cover ${v.hidden ? 'opacity-40' : ''}`} />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white">
            {v.hidden ? <EyeOff className="size-5" /> : <Play className="ml-0.5 size-5 fill-current" />}
          </span>
        </span>
        {v.hidden && (
          <span className="absolute top-2 left-2">
            <FlagBadge tone="bad">{t.videos.hiddenBadge}</FlagBadge>
          </span>
        )}
      </span>
      <span className="flex flex-col gap-1 p-2.5">
        <span className="truncate text-sm font-medium">{v.owner.name}</span>
        <span className="truncate text-xs text-muted-foreground">{v.title || t.videos.noCaption}</span>
        <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs tabular-nums text-muted-foreground">
          <Stat icon={Heart} value={formatNumber(v.likes, locale)} label={t.videos.likes} />
          <Stat icon={MessageCircle} value={formatNumber(v.comments, locale)} label={t.videos.comments} />
          <Stat icon={Share2} value={formatNumber(v.shares, locale)} label={t.videos.shares} />
        </span>
      </span>
    </button>
  )
}

function Stat({ icon: Icon, value, label }: { icon: typeof Heart; value: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{label}:</span>
      {value}
    </span>
  )
}

function VideoDetail({ video: v }: { video: AdminVideo }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'comments' | 'likes'>('comments')
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const path = `/admin/videos/${v.kind}/${v.id}`

  const toggle = () =>
    setConfirm({
      title: v.hidden ? t.videos.unhide : t.videos.hide,
      description: v.hidden ? t.videos.unhideBody : t.videos.hideBody,
      confirmLabel: v.hidden ? t.videos.unhide : t.videos.hide,
      destructive: !v.hidden,
      reason: v.hidden ? undefined : { required: true },
      onConfirm: async ({ reason }) => {
        await send('POST', `${path}/${v.hidden ? 'unhide' : 'hide'}`, { reason })
        await queryClient.invalidateQueries({ queryKey: KEY })
        toast.success(v.hidden ? t.videos.unhidden : t.videos.hidden)
      },
    })

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6">{v.title || t.videos.noCaption}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
        <video src={v.videoUrl} poster={v.posterUrl ?? undefined} controls playsInline className="mx-auto aspect-[9/16] w-56 rounded-xl bg-black object-contain sm:w-full" />
        <div className="flex min-w-0 flex-col gap-3 text-sm">
          <div>
            {v.kind === 'customer' ? (
              <Link to={`/customers/${v.owner.id}`} className="font-medium hover:underline">
                {v.owner.name}
              </Link>
            ) : (
              <Link to={`/shops/${v.owner.id}`} className="font-medium hover:underline">
                {v.owner.name}
              </Link>
            )}
            <p className="text-xs text-muted-foreground">
              {v.owner.contact && `${v.owner.contact} · `}
              {formatDate(v.createdAt, locale, true)}
            </p>
            {v.kind === 'shop' && (
              <p className="mt-1 flex items-center gap-2">
                <Link to={`/products/${v.id}`} className="text-xs font-medium text-primary hover:underline">
                  {t.videos.viewProduct}
                </Link>
                {v.productStatus && <ProductStatusBadge status={v.productStatus} />}
              </p>
            )}
          </div>
          <dl className="grid grid-cols-4 gap-2 rounded-lg bg-muted p-2 text-center">
            {(
              [
                [t.videos.views, v.views],
                [t.videos.likes, v.likes],
                [t.videos.comments, v.comments],
                [t.videos.shares, v.shares],
              ] as const
            ).map(([label, n]) => (
              <div key={label}>
                <dd className="font-semibold tabular-nums">{formatNumber(n, locale)}</dd>
                <dt className="text-xs text-muted-foreground">{label}</dt>
              </div>
            ))}
          </dl>
          {v.hidden && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-red-900 dark:bg-red-950/40 dark:text-red-100">
              {fill(t.videos.hiddenNote, { date: v.hiddenAt ? formatDate(v.hiddenAt, locale, true) : '', reason: v.hiddenReason ?? '' })}
            </p>
          )}
          <Button variant={v.hidden ? 'outline' : 'destructive'} className="self-start" onClick={toggle}>
            {v.hidden ? <Eye /> : <EyeOff />}
            {v.hidden ? t.videos.unhide : t.videos.hide}
          </Button>
          <FilterTabs
            tabs={[
              { key: 'comments' as const, label: t.videos.comments, count: v.comments },
              { key: 'likes' as const, label: t.videos.likes, count: v.likes },
            ]}
            active={tab}
            onSelect={setTab}
          />
          {tab === 'comments' ? <Comments path={path} /> : <Likes path={path} />}
        </div>
      </div>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function Comments({ path }: { path: string }) {
  const { t, locale } = useI18n()
  const [page, setPage] = useState(1)
  const list = useQuery({ queryKey: [...KEY, path, 'comments', page], queryFn: () => api<Paged<AdminVideoComment>>(`${path}/comments?page=${page}&pageSize=10`) })
  if (list.isPending) return <LoadingState />
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />
  if (!list.data.items.length) return <p className="py-4 text-center text-muted-foreground">{t.videos.noComments}</p>
  return (
    <>
      <ul className="flex flex-col gap-2">
        {list.data.items.map((c) => (
          <li key={c.id} className={`rounded-lg border p-2.5 ${c.isReply ? 'ml-4' : ''}`}>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <Link to={`/customers/${c.author.id}`} className="font-medium text-foreground hover:underline">
                {c.author.name}
              </Link>
              {c.byShop && <FlagBadge tone="info">{t.videos.byShop}</FlagBadge>}
              {c.isReply && <span>{t.videos.reply}</span>}
              {c.deleted && <FlagBadge tone="bad">{t.videos.deleted}</FlagBadge>}
              <span>· {formatDate(c.createdAt, locale, true)}</span>
            </p>
            <p className={`mt-1 break-words whitespace-pre-line ${c.deleted ? 'text-muted-foreground line-through' : ''}`}>{c.body}</p>
          </li>
        ))}
      </ul>
      <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={setPage} />
    </>
  )
}

function Likes({ path }: { path: string }) {
  const { t, locale } = useI18n()
  const [page, setPage] = useState(1)
  const list = useQuery({ queryKey: [...KEY, path, 'likes', page], queryFn: () => api<Paged<AdminVideoLike>>(`${path}/likes?page=${page}&pageSize=10`) })
  if (list.isPending) return <LoadingState />
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />
  if (!list.data.items.length) return <p className="py-4 text-center text-muted-foreground">{t.videos.noLikes}</p>
  return (
    <>
      <ul className="divide-y rounded-lg border">
        {list.data.items.map((l) => (
          <li key={l.customer.id} className="flex items-center justify-between gap-3 px-3 py-2">
            <Link to={`/customers/${l.customer.id}`} className="truncate font-medium hover:underline">
              {l.customer.name}
            </Link>
            <span className="shrink-0 text-xs text-muted-foreground">{formatDate(l.createdAt, locale)}</span>
          </li>
        ))}
      </ul>
      <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={setPage} />
    </>
  )
}

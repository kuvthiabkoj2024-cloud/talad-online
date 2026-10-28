import { Button } from '@talad/ui/components/button'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckCircle2, Eye, Heart, ImageOff, MessageCircle, Play, Share2, Video, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { FilterTabs, Pager } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { ProductStatusBadge } from '@/components/status-badge'
import { VideoViewer } from '@/components/video-viewer'
import { queryKeys, useClearBadge } from '@/hooks/queries'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { fill, formatNumber } from '@/lib/format'
import type { ShopProductList, ShopProductRow, ShopVideo, ShopVideoList } from '@/lib/types'

const PAGE_SIZE = 24

/**
 * Product videos (shown in the storefront Feed) with their views, likes, comments and
 * shares — tap one to watch full screen and answer comments — and products still missing one.
 */
export function VideosPage() {
  useClearBadge('videos')
  const { t } = useI18n()
  const { params, set, page } = useUrlParams()
  const tab = params.get('tab') === 'without' ? 'without' : 'with'
  const [playing, setPlaying] = useState<number | null>(null)
  // `?video=<productId>` (a notification about a like or comment): open that video by itself.
  const linked = params.get('video')
  const linkedVideo = useQuery({
    queryKey: [...queryKeys.videos, 'one', linked],
    queryFn: () => api<ShopVideoList>(`/me/shop/videos?productId=${linked}&pageSize=1`),
    enabled: !!linked,
  })

  const videos = useQuery({
    queryKey: [...queryKeys.videos, 'list', page],
    queryFn: () => api<ShopVideoList>(`/me/shop/videos?page=${page}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  })
  const missing = useQuery({
    queryKey: [...queryKeys.products, { video: 'without', page: tab === 'without' ? page : 1 }],
    queryFn: () => api<ShopProductList>(`/me/shop/products?video=without&page=${tab === 'without' ? page : 1}&pageSize=${PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  })
  const list = tab === 'with' ? videos : missing

  return (
    <>
      <TopBar title={t.videos.title} backTo="/" />
      <PageBody>
        <PageIntro title={t.videos.title} description={t.videos.description} />
        {videos.data && videos.data.total > 0 && <Totals totals={videos.data.totals} />}
        <FilterTabs
          tabs={[
            { key: 'with', label: t.videos.withVideo, count: videos.data?.total },
            { key: 'without', label: t.videos.withoutVideo, count: missing.data?.total },
          ]}
          active={tab}
          onSelect={(key) => set({ tab: key === 'with' ? undefined : key, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : tab === 'with' ? (
          videos.data!.items.length === 0 ? (
            <EmptyState icon={Video} title={t.videos.emptyTitle} body={t.videos.emptyBody} action={<Button onClick={() => set({ tab: 'without' })}>{t.videos.withoutVideo}</Button>} />
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {videos.data!.items.map((v, i) => (
                  <li key={v.productId}>
                    <VideoTile video={v} onOpen={() => setPlaying(i)} />
                  </li>
                ))}
              </ul>
              <Pager page={videos.data!.page} totalPages={videos.data!.totalPages} onPage={(n) => set({ page: String(n) })} />
            </>
          )
        ) : missing.data!.items.length === 0 ? (
          <EmptyState icon={CheckCircle2} title={t.videos.allHaveVideo} />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {missing.data!.items.map((p) => (
                <li key={p.id}>
                  <MissingTile product={p} />
                </li>
              ))}
            </ul>
            <Pager page={missing.data!.page} totalPages={missing.data!.totalPages} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </PageBody>
      {playing !== null && videos.data && <VideoViewer videos={videos.data.items} index={playing} onIndex={setPlaying} onClose={() => setPlaying(null)} />}
      {linked && linkedVideo.data?.items.length ? (
        <VideoViewer
          videos={linkedVideo.data.items}
          index={0}
          onIndex={() => {}}
          onClose={() => set({ video: undefined, comment: undefined })}
          openComments={!!params.get('comment')}
        />
      ) : null}
    </>
  )
}

const TOTALS: { key: keyof ShopVideoList['totals']; icon: LucideIcon; tone: string }[] = [
  { key: 'views', icon: Eye, tone: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400' },
  { key: 'likes', icon: Heart, tone: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400' },
  { key: 'comments', icon: MessageCircle, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' },
  { key: 'shares', icon: Share2, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400' },
]

/** All videos together, in the same slim strip as the home page. */
function Totals({ totals }: { totals: ShopVideoList['totals'] }) {
  const { t, locale } = useI18n()
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border shadow-xs ring-1 ring-border lg:grid-cols-4">
      {TOTALS.map(({ key, icon: Icon, tone }) => (
        <div key={key} className="flex items-center gap-3 bg-card px-4 py-3">
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', tone)}>
            <Icon className="size-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{t.videos[key]}</span>
            <span className="block text-lg leading-tight font-bold tabular-nums">{formatNumber(totals[key], locale)}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function compact(n: number, _locale: 'lo' | 'en') {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

function VideoTile({ video: v, onOpen }: { video: ShopVideo; onOpen: () => void }) {
  const { t, locale } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      {/* The clip opens the full-screen viewer; the title goes to the product, as before. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={fill(t.videos.open, { name: v.name })}
        className="group relative block aspect-[9/16] w-full overflow-hidden rounded-xl bg-black text-left shadow-sm ring-1 ring-border transition-shadow hover:shadow-lg"
      >
        {/* Plays on hover; the first frame (or the cover photo) otherwise. */}
        <video
          src={v.videoUrl}
          poster={v.imageUrl ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => e.currentTarget.pause()}
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0">
          <span className="flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
        <span className="absolute top-2 left-2">
          <ProductStatusBadge status={v.status} className="bg-white/90" />
        </span>
        {/* The numbers, TikTok-style, over the bottom of the clip. */}
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2.5 pt-10 pb-2 text-white">
          <span className="flex items-center gap-1 text-sm font-semibold drop-shadow">
            <Play className="size-3.5 fill-current" />
            {compact(v.views, locale)}
          </span>
          <span className="flex items-center gap-3 text-xs font-medium tabular-nums">
            <span className="flex items-center gap-1">
              <Heart className={cn('size-3.5', v.likes > 0 && 'fill-rose-500 text-rose-500')} />
              {compact(v.likes, locale)}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="size-3.5" />
              {compact(v.comments, locale)}
            </span>
            <span className="flex items-center gap-1">
              <Share2 className="size-3.5" />
              {compact(v.shares, locale)}
            </span>
          </span>
        </span>
      </button>
      <Link to={`/products/${v.productId}`} className="line-clamp-2 text-sm font-medium hover:text-primary hover:underline">
        {v.name}
      </Link>
    </div>
  )
}

function MissingTile({ product: p }: { product: ShopProductRow }) {
  const { t } = useI18n()
  return (
    <Link to={`/products/${p.id}`} className="group flex flex-col gap-2">
      <span className="relative flex aspect-[9/16] flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed bg-muted text-muted-foreground transition-colors group-hover:border-primary group-hover:text-primary">
        {p.imageUrl ? (
          <img src={p.imageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-30" loading="lazy" />
        ) : (
          <ImageOff className="absolute top-3 size-5" />
        )}
        <Video className="relative size-7" />
        <span className="relative text-sm font-medium">{t.videos.addVideo}</span>
      </span>
      <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
    </Link>
  )
}

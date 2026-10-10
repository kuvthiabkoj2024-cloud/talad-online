import { Button } from '@talad/ui/components/button'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckCircle2, ImageOff, Play, Video } from 'lucide-react'
import { Link } from 'react-router'
import { FilterTabs, Pager } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { ProductStatusBadge } from '@/components/status-badge'
import { queryKeys } from '@/hooks/queries'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import type { ShopProductList, ShopProductRow } from '@/lib/types'

/** Product videos (shown in the storefront Feed) and products still missing one. */
export function VideosPage() {
  const { t } = useI18n()
  const { params, set, page } = useUrlParams()
  const tab = params.get('tab') === 'without' ? 'without' : 'with'

  const list = useQuery({
    queryKey: [...queryKeys.products, { video: tab, page }],
    queryFn: () => api<ShopProductList>(`/me/shop/products?video=${tab}&page=${page}&pageSize=24`),
    placeholderData: keepPreviousData,
  })
  // Both counts for the tabs.
  const other = useQuery({
    queryKey: [...queryKeys.products, { video: tab === 'with' ? 'without' : 'with', page: 1, countOnly: true }],
    queryFn: () => api<ShopProductList>(`/me/shop/products?video=${tab === 'with' ? 'without' : 'with'}&pageSize=1`),
  })
  const counts = { [tab]: list.data?.total, [tab === 'with' ? 'without' : 'with']: other.data?.total } as Record<'with' | 'without', number | undefined>

  return (
    <>
      <TopBar title={t.videos.title} backTo="/" />
      <PageBody>
        <PageIntro title={t.videos.title} description={t.videos.description} />
        <FilterTabs
          tabs={[
            { key: 'with', label: t.videos.withVideo, count: counts.with },
            { key: 'without', label: t.videos.withoutVideo, count: counts.without },
          ]}
          active={tab}
          onSelect={(key) => set({ tab: key === 'with' ? undefined : key, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          tab === 'with' ? (
            <EmptyState
              icon={Video}
              title={t.videos.emptyTitle}
              body={t.videos.emptyBody}
              action={
                <Button onClick={() => set({ tab: 'without' })}>{t.videos.withoutVideo}</Button>
              }
            />
          ) : (
            <EmptyState icon={CheckCircle2} title={t.videos.allHaveVideo} />
          )
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {list.data.items.map((p) => (
                <li key={p.id}>{tab === 'with' ? <VideoTile product={p} /> : <MissingTile product={p} />}</li>
              ))}
            </ul>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </PageBody>
    </>
  )
}

function VideoTile({ product: p }: { product: ShopProductRow }) {
  return (
    <Link to={`/products/${p.id}`} className="group flex flex-col gap-2">
      <span className="relative block aspect-[9/16] overflow-hidden rounded-xl bg-black">
        {/* Plays on hover/focus; the first frame (or the cover photo) otherwise. */}
        <video
          src={p.videoUrl ?? undefined}
          poster={p.imageUrl ?? undefined}
          muted
          loop
          playsInline
          preload="metadata"
          onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
          onMouseLeave={(e) => e.currentTarget.pause()}
          className="size-full object-cover"
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity group-hover:opacity-0">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/50 text-white">
            <Play className="ml-0.5 size-5 fill-current" />
          </span>
        </span>
        <span className="absolute top-2 left-2">
          <ProductStatusBadge status={p.status} className="bg-white/90" />
        </span>
      </span>
      <span className="line-clamp-2 text-sm font-medium group-hover:underline">{p.name}</span>
    </Link>
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

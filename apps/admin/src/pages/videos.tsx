import { Button } from '@talad/ui/components/button'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Clapperboard, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { VideoGrid } from '@/components/video-grid'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { fill } from '@/lib/format'
import type { AdminVideo, AdminVideoKind, CustomerDetail, Paged } from '@/lib/types'

const KINDS: AdminVideoKind[] = ['customer', 'shop']
const STATUSES = ['all', 'visible', 'hidden'] as const
type Status = (typeof STATUSES)[number]

function useVideos(kind: AdminVideoKind, customerId?: string) {
  const { params, set, page } = useUrlParams()
  const status: Status = (STATUSES as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as Status) : 'all'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useSearchParamInput(q, set)
  const query = new URLSearchParams({ page: String(page) })
  if (status !== 'all') query.set('status', status)
  if (q) query.set('q', q)
  if (customerId) query.set('customerId', customerId)
  const list = useQuery({
    queryKey: ['admin', 'videos', kind, { status, q, page, customerId }],
    queryFn: () => api<Paged<AdminVideo>>(`/admin/videos/${kind}?${query}`),
    placeholderData: keepPreviousData,
  })
  return { list, status, search, setSearch, set }
}

function Results({ list, set, emptyTitle }: { list: ReturnType<typeof useVideos>['list']; set: ReturnType<typeof useVideos>['set']; emptyTitle: string }) {
  if (list.isPending) return <LoadingState />
  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />
  if (list.data.items.length === 0) return <EmptyState icon={Clapperboard} title={emptyTitle} />
  return (
    <>
      <VideoGrid videos={list.data.items} />
      <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => set({ page: String(p) })} />
    </>
  )
}

/** All videos, customers' and shops' in their own tabs. `?tab=shop&status=hidden&q=` */
export function VideosPage() {
  const { t } = useI18n()
  const { params } = useUrlParams()
  const kind: AdminVideoKind = params.get('tab') === 'shop' ? 'shop' : 'customer'
  const { list, status, search, setSearch, set } = useVideos(kind)
  return (
    <>
      <TopBar title={t.videos.title} />
      <PageBody>
        <PageIntro title={t.videos.title} description={t.videos.description} />
        <FilterTabs
          tabs={KINDS.map((k) => ({ key: k, label: t.videos.kinds[k] }))}
          active={kind}
          onSelect={(k) => set({ tab: k === 'customer' ? undefined : k, status: undefined, page: undefined })}
        />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs tabs={STATUSES.map((s) => ({ key: s, label: t.videos.statuses[s] }))} active={status} onSelect={(s) => set({ status: s === 'all' ? undefined : s, page: undefined })} />
          <SearchBox value={search} onChange={setSearch} placeholder={t.videos.searchPlaceholder[kind]} />
        </div>
        <Results list={list} set={set} emptyTitle={t.videos.emptyTitle} />
      </PageBody>
    </>
  )
}

/** One customer's feed videos, from the customer list. */
export function CustomerVideosPage() {
  const { id = '' } = useParams()
  const { t } = useI18n()
  const customer = useQuery({ queryKey: ['admin', 'customers', id], queryFn: () => api<CustomerDetail>(`/admin/customers/${id}`) })
  const { list, status, set } = useVideos('customer', id)
  const name = customer.data?.name ?? ''
  return (
    <>
      <TopBar title={name ? fill(t.videos.customerTitle, { name }) : t.videos.title} backTo="/customers" />
      <PageBody>
        <PageIntro title={name ? fill(t.videos.customerTitle, { name }) : t.videos.title} description={t.videos.customerDescription} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs tabs={STATUSES.map((s) => ({ key: s, label: t.videos.statuses[s] }))} active={status} onSelect={(s) => set({ status: s === 'all' ? undefined : s, page: undefined })} />
          <Button variant="outline" asChild>
            <Link to={`/customers/${id}`}>
              <UserRound />
              {t.customers.viewDetail}
            </Link>
          </Button>
        </div>
        <Results list={list} set={set} emptyTitle={t.videos.customerEmpty} />
      </PageBody>
    </>
  )
}

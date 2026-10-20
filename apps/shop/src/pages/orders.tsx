import { isShopOrderTab, SHOP_ORDER_TABS, type OrderStatus, type ShopOrderTab } from '@talad/shared'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronRight, ImageOff, ReceiptText, ScanSearch } from 'lucide-react'
import { Link } from 'react-router'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { OrderStatusBadge } from '@/components/status-badge'
import { queryKeys, useClearBadge } from '@/hooks/queries'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { fill, formatDate, formatMoney } from '@/lib/format'
import type { ShopOrderList, ShopOrderSummary } from '@/lib/types'

const TABS = Object.keys(SHOP_ORDER_TABS) as ShopOrderTab[]
const PAGE_SIZES = [10, 20, 50]
const DEFAULT_PAGE_SIZE = 20

/** Each status has its own card border, so the queue reads at a glance. */
const STATUS_BORDER: Record<OrderStatus, string> = {
  PENDING: 'border-orange-400 dark:border-orange-600',
  CONFIRMED: 'border-yellow-400 dark:border-yellow-600',
  PACKED: 'border-purple-400 dark:border-purple-600',
  SHIPPED: 'border-sky-500 dark:border-sky-600',
  DELIVERED: 'border-sky-500 dark:border-sky-600',
  RETURN_REQUESTED: 'border-red-400 dark:border-red-600',
  COMPLETED: 'border-green-500 dark:border-green-600',
  CANCELLED: 'border-zinc-300 dark:border-zinc-600',
}

/** Order queue by status (§3.6). `?tab=to-ship&q=&page=` */
export function OrdersPage() {
  useClearBadge('orders')
  const { t } = useI18n()
  const { params, set, page } = useUrlParams()
  const tab = isShopOrderTab(params.get('tab')) ? (params.get('tab') as ShopOrderTab) : 'all'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useSearchParamInput(q, set)
  const size = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : DEFAULT_PAGE_SIZE

  const query = new URLSearchParams({ page: String(page), pageSize: String(size) })
  if (tab !== 'all') query.set('tab', tab)
  if (q) query.set('q', q)
  const list = useQuery({
    queryKey: [...queryKeys.orders, { tab, q, page, size }],
    queryFn: () => api<ShopOrderList>(`/me/shop/orders?${query}`),
    placeholderData: keepPreviousData,
  })
  const data = list.data

  return (
    <>
      <TopBar title={t.orders.title} backTo="/" />
      <PageBody>
        <PageIntro title={t.orders.title} description={t.orders.description} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs
            tabs={(['all', ...TABS] as const).map((key) => ({ key, label: t.orders.tabs[key], count: data?.counts[key] }))}
            active={tab}
            onSelect={(key) => set({ tab: key === 'all' ? undefined : key, page: undefined })}
          />
          <SearchBox value={search} onChange={setSearch} placeholder={t.orders.searchPlaceholder} />
        </div>

        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : data!.items.length === 0 ? (
          <EmptyState icon={ReceiptText} title={t.orders.emptyTitle} body={t.orders.emptyBody} />
        ) : (
          <>
            {/* Up to 3 per row; cards in a row share a height so their footers line up. */}
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data!.items.map((o) => (
                <li key={o.number} className="flex min-w-0">
                  <OrderCard order={o} />
                </li>
              ))}
            </ul>
            <Pager
              page={data!.page}
              totalPages={data!.totalPages}
              onPage={(p) => {
                set({ page: String(p) })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              total={data!.total}
              pageSize={size}
              pageSizes={PAGE_SIZES}
              onPageSize={(n) => set({ size: n === DEFAULT_PAGE_SIZE ? undefined : String(n), page: undefined })}
            />
          </>
        )}
      </PageBody>
    </>
  )
}

function OrderCard({ order: o }: { order: ShopOrderSummary }) {
  const { t, locale } = useI18n()
  const shown = o.items.slice(0, 2)
  return (
    <Link
      to={`/orders/${o.number}`}
      className={cn(
        'flex w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md',
        STATUS_BORDER[o.status],
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <span className="font-mono font-semibold">{o.number}</span>
          <span className="truncate text-muted-foreground">· {o.customer.name}</span>
        </span>
        <span className="flex items-center gap-2">
          {o.awaitingConfirmation && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              <ScanSearch className="size-3.5" />
              {t.orders.slipToCheck}
            </span>
          )}
          <OrderStatusBadge status={o.status} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-4 py-3">
        {shown.map((i) => (
          <div key={i.sku} className="flex items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
              {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-sm">{i.name}</span>
              <span className="text-xs text-muted-foreground">
                {i.variant && `${i.variant} · `}x{i.quantity}
              </span>
            </span>
            <span className="text-sm tabular-nums">{formatMoney(i.lineTotal, locale)}</span>
          </div>
        ))}
        {o.items.length > shown.length && <span className="text-xs text-muted-foreground">+{o.items.length - shown.length}</span>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/40 px-4 py-2.5 text-sm">
        <span className="text-xs text-muted-foreground">
          {fill(t.orders.placed, { date: formatDate(o.createdAt, locale, true) })}
          {o.payment && ` · ${t.orders.methods[o.payment.method]}`}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">{o.itemCount === 1 ? t.orders.item : fill(t.orders.items, { n: o.itemCount })} ·</span>
          <span className="font-semibold text-primary">{formatMoney(o.total, locale)}</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </span>
      </div>
    </Link>
  )
}

import { isShopOrderTab, SHOP_ORDER_TABS, type OrderStatus, type ShopOrderTab } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Check, ChevronRight, ImageOff, LoaderCircle, Printer, ReceiptText, Store, Tag, X, Zap } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { OrderStatusBadge } from '@/components/status-badge'
import { queryKeys, useClearBadge, useMyShop, useShopProfile } from '@/hooks/queries'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { fill, formatDate, formatMoney } from '@/lib/format'
import { billHtml, combineHtml, printHtml, stickerHtml } from '@/lib/print-order'
import type { ShopOrderDetail, ShopOrderList, ShopOrderSummary } from '@/lib/types'

// Unpaid transfers are Taladonline's to check; shops get orders once they are paid.
const TABS = (Object.keys(SHOP_ORDER_TABS) as ShopOrderTab[]).filter((t) => t !== 'to-pay')
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
  const { t, locale } = useI18n()
  // Printing several at once: pick orders, then print their bills or stickers in one go.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [printing, setPrinting] = useState<'bill' | 'sticker' | null>(null)
  const profile = useShopProfile()
  const shop = useMyShop()
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

  const toggle = (number: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(number)) next.delete(number)
      else next.add(number)
      return next
    })
  const pageNumbers = data?.items.map((o) => o.number) ?? []
  const allSelected = pageNumbers.length > 0 && pageNumbers.every((n) => selected.has(n))

  async function print(kind: 'bill' | 'sticker') {
    setPrinting(kind)
    try {
      // The list has summaries; bills need each order's full details.
      const orders = await Promise.all([...selected].map((n) => api<ShopOrderDetail>(`/me/shop/orders/${encodeURIComponent(n)}`)))
      const printShop = {
        name: profile.data?.name ?? shop.data?.name ?? '',
        logoUrl: profile.data?.logoUrl ?? shop.data?.logoUrl ?? null,
        phone: profile.data?.phone ?? shop.data?.phone ?? '',
        email: profile.data?.email ?? shop.data?.email ?? '',
        address: profile.data?.address ?? null,
      }
      printHtml(combineHtml(orders.map((o) => (kind === 'bill' ? billHtml(o, printShop, t, locale) : stickerHtml(o, printShop, t, locale)))))
    } catch {
      toast.error(t.print.failed)
    } finally {
      setPrinting(null)
    }
  }

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
          <div className="flex items-center gap-2">
            <SearchBox value={search} onChange={setSearch} placeholder={t.orders.searchPlaceholder} />
            {!selecting && (
              <Button variant="outline" onClick={() => setSelecting(true)} disabled={!data?.items.length}>
                <Printer />
                {t.print.button}
              </Button>
            )}
          </div>
        </div>

        {selecting && (
          <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card px-3 py-2 shadow-sm">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Printer className="size-4 text-primary" />
              {selected.size ? fill(t.print.selected, { n: selected.size }) : t.print.selectHint}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setSelected((s) => {
                  const next = new Set(s)
                  for (const n of pageNumbers) if (allSelected) next.delete(n)
                  else next.add(n)
                  return next
                })
              }
            >
              {allSelected ? t.print.clear : t.print.selectAll}
            </Button>
            <span className="ml-auto flex flex-wrap gap-2">
              <Button size="sm" disabled={!selected.size || printing !== null} onClick={() => void print('bill')}>
                {printing === 'bill' ? <LoaderCircle className="animate-spin" /> : <ReceiptText />}
                {printing === 'bill' ? t.print.preparing : t.print.printBills}
              </Button>
              <Button size="sm" variant="outline" disabled={!selected.size || printing !== null} onClick={() => void print('sticker')}>
                {printing === 'sticker' ? <LoaderCircle className="animate-spin" /> : <Tag />}
                {printing === 'sticker' ? t.print.preparing : t.print.printStickers}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelecting(false)
                  setSelected(new Set())
                }}
              >
                <X />
                {t.print.done}
              </Button>
            </span>
          </div>
        )}

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
                  <OrderCard order={o} selecting={selecting} selected={selected.has(o.number)} onToggle={() => toggle(o.number)} />
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

function OrderCard({
  order: o,
  selecting,
  selected,
  onToggle,
}: {
  order: ShopOrderSummary
  /** Print mode: the card picks the order instead of opening it. */
  selecting: boolean
  selected: boolean
  onToggle: () => void
}) {
  const { t, locale } = useI18n()
  const shown = o.items.slice(0, 2)
  const className = cn(
    'flex w-full min-w-0 flex-col overflow-hidden rounded-xl border bg-card text-left transition-shadow hover:shadow-md',
    STATUS_BORDER[o.status],
    selecting && selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
  )
  const body = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          {selecting && (
            <span
              aria-hidden
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-md border-2',
                selected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
              )}
            >
              {selected && <Check className="size-3.5" strokeWidth={3} />}
            </span>
          )}
          <span className="font-mono font-semibold">{o.number}</span>
          <span className="truncate text-muted-foreground">· {o.customer.name}</span>
        </span>
        <span className="flex items-center gap-2">
          {o.urgent && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700 dark:bg-red-950 dark:text-red-200">
              <Zap className="size-3.5" />
              {t.orders.urgent}
            </span>
          )}
          {o.pickup && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              <Store className="size-3.5" />
              {t.orders.pickup}
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
          {!selecting && <ChevronRight className="size-4 text-muted-foreground" />}
        </span>
      </div>
    </>
  )
  return selecting ? (
    <button type="button" role="checkbox" aria-checked={selected} onClick={onToggle} className={className}>
      {body}
    </button>
  ) : (
    <Link to={`/orders/${o.number}`} className={className}>
      {body}
    </Link>
  )
}

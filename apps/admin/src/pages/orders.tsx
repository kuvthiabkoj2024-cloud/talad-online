import { formatPhone, isShopOrderTab, provinceName, SHOP_ORDER_TABS, type ShopOrderTab } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ImageOff, ReceiptText, ScanSearch, TriangleAlert } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { OrderStatusBadge } from '@/components/badges'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber } from '@/lib/format'
import { openPrivateFile } from '@/lib/private-file'
import type { OrderDetail, OrderList } from '@/lib/types'

const TABS = Object.keys(SHOP_ORDER_TABS) as ShopOrderTab[]

/** Every order on the platform, read-only (support). `?status=<tab>&q=` */
export function OrdersPage() {
  const { t, locale } = useI18n()
  const { params, set, page } = useUrlParams()
  const tab = isShopOrderTab(params.get('status')) ? (params.get('status') as ShopOrderTab) : 'all'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useSearchParamInput(q, set)
  const query = new URLSearchParams({ page: String(page) })
  if (tab !== 'all') query.set('status', tab)
  if (q) query.set('q', q)
  const list = useQuery({
    queryKey: ['admin', 'orders', { tab, q, page }],
    queryFn: () => api<OrderList>(`/admin/orders?${query}`),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <TopBar title={t.orders.title} />
      <PageBody>
        <PageIntro title={t.orders.title} description={t.orders.description} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs
            tabs={(['all', ...TABS] as const).map((k) => ({ key: k, label: t.orders.tabs[k], count: list.data?.counts[k] }))}
            active={tab}
            onSelect={(k) => set({ status: k === 'all' ? undefined : k, page: undefined })}
          />
          <SearchBox value={search} onChange={setSearch} placeholder={t.orders.searchPlaceholder} />
        </div>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={ReceiptText} title={t.orders.emptyTitle} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">#</TableHead>
                    <TableHead>{t.orders.customer}</TableHead>
                    <TableHead>{t.orders.shop}</TableHead>
                    <TableHead>{t.orders.items}</TableHead>
                    <TableHead>{t.orders.total}</TableHead>
                    <TableHead>{t.orders.placed}</TableHead>
                    <TableHead className="pr-4">{t.common.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((o) => (
                    <TableRow key={o.number}>
                      <TableCell className="pl-4">
                        <Link to={`/orders/${o.number}`} className="font-mono font-medium hover:underline">
                          {o.number}
                        </Link>
                      </TableCell>
                      <TableCell>{o.customer.name}</TableCell>
                      <TableCell>
                        <Link to={`/shops/${o.shop.id}`} className="hover:underline">
                          {o.shop.name}
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatNumber(o.itemCount, locale)}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(o.total, locale)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(o.createdAt, locale, true)}</TableCell>
                      <TableCell className="pr-4">
                        <span className="flex items-center gap-1">
                          <OrderStatusBadge status={o.status} />
                          {o.awaitingConfirmation && <ScanSearch className="size-4 text-amber-600" aria-label={t.orders.viewSlip} />}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </PageBody>
    </>
  )
}

export function OrderDetailPage() {
  const { number = '' } = useParams()
  const { t, locale } = useI18n()
  const order = useQuery({ queryKey: ['admin', 'orders', number], queryFn: () => api<OrderDetail>(`/admin/orders/${encodeURIComponent(number)}`) })

  if (order.isPending || order.isError) {
    return (
      <>
        <TopBar title={number} backTo="/orders" />
        {order.isPending ? <LoadingState /> : <ErrorState onRetry={() => void order.refetch()} />}
      </>
    )
  }
  const o = order.data
  const a = o.shippingAddress
  return (
    <>
      <TopBar title={o.number} backTo="/orders" />
      <PageBody className="max-w-6xl">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-2xl font-semibold">{o.number}</h2>
          <OrderStatusBadge status={o.status} />
          <span className="text-sm text-muted-foreground">
            {formatDate(o.createdAt, locale, true)} ·{' '}
            <Link to={`/shops/${o.shop.id}`} className="hover:underline">
              {o.shop.name}
            </Link>
          </span>
        </div>
        {o.cancelReason && o.status === 'CANCELLED' && <Note>{fill(t.orders.cancelReason, { reason: o.cancelReason })}</Note>}
        {o.dispute && <Note danger>{fill(t.orders.disputeOpen, { reason: o.dispute.reason })}</Note>}

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card className="gap-3">
              <CardContent className="flex flex-col gap-3">
                {o.items.map((i) => (
                  <div key={i.sku} className="flex items-center gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                      {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-full object-cover" /> : <ImageOff className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="line-clamp-1 font-medium">{i.name}</span>
                      <span className="text-xs text-muted-foreground">
                        <span className="font-mono">{i.sku}</span>
                        {i.variant && ` · ${i.variant}`} · ×{i.quantity}
                      </span>
                    </span>
                    <span className="text-sm tabular-nums">{formatMoney(i.lineTotal, locale)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t.orders.timeline}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative flex flex-col gap-4 border-l pl-5">
                  {[...o.history].reverse().map((h, i) => (
                    <li key={i} className="relative">
                      <span className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-card', i === 0 ? 'bg-primary' : 'bg-muted-foreground/40')} />
                      <p className="text-sm font-medium">{t.orderStatus[h.status]}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(h.at, locale, true)} · {t.orders.actors[h.actor ?? 'SYSTEM']}
                      </p>
                      {h.note && <p className="text-sm text-muted-foreground">{h.note}</p>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-col gap-5">
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="text-base">{t.orders.customer}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <Link to={`/customers/${o.customer.id}`} className="font-medium text-primary hover:underline">
                  {o.customer.name}
                </Link>
                {a && (
                  <p className="mt-1 text-muted-foreground">
                    {a.recipientName} · {formatPhone(a.phone)}
                    <br />
                    {[a.line, a.village, a.district, provinceName(a.province, locale)].filter(Boolean).join(', ')}
                  </p>
                )}
                {o.note && <p className="mt-2 rounded-md bg-muted px-2 py-1">{o.note}</p>}
              </CardContent>
            </Card>
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="text-base">{t.orders.payment}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                {o.payment && <Row label={t.orders.methods[o.payment.method]} value={t.orders.paymentStatus[o.payment.status]} />}
                {o.payment?.hasSlip && (
                  <Button variant="outline" size="sm" className="mt-1 self-start" onClick={() => void openPrivateFile(`/admin/orders/${encodeURIComponent(o.number)}/slip`)}>
                    <ScanSearch />
                    {t.orders.viewSlip}
                  </Button>
                )}
                <div className="my-1 border-t" />
                <Row label={t.orders.subtotal} value={formatMoney(o.subtotal, locale)} />
                {o.discountTotal > 0 && <Row label={t.orders.discount} value={`−${formatMoney(o.discountTotal, locale)}`} />}
                <Row label={t.orders.total} value={formatMoney(o.total, locale)} strong />
                <Row label={t.orders.commission} value={formatMoney(o.commissionAmount, locale)} />
                <Row label={t.orders.shopReceives} value={formatMoney(o.total - o.commissionAmount, locale)} />
              </CardContent>
            </Card>
            {(o.deliveryProvider || o.trackingNumber) && (
              <Card className="gap-2">
                <CardHeader>
                  <CardTitle className="text-base">{t.orders.delivery}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5 text-sm">
                  {o.deliveryProvider && <Row label={t.orders.courier} value={o.deliveryProvider.name} />}
                  {o.trackingNumber && <Row label={t.orders.tracking} value={<span className="font-mono">{o.trackingNumber}</span>} />}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageBody>
    </>
  )
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'font-semibold')}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}

function Note({ danger, children }: { danger?: boolean; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl border p-3 text-sm',
        danger ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100' : 'bg-muted text-muted-foreground',
      )}
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

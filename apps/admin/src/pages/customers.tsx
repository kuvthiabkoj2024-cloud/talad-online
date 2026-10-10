import { formatPhone } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { FlagBadge, OrderStatusBadge, ShopStatusBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import type { CustomerDetail, CustomerRow, OrderList, Paged } from '@/lib/types'

const FILTERS = ['all', 'active', 'suspended', 'sellers'] as const

/** Customer accounts (§2.4). `?status=active|suspended|sellers&q=` */
export function CustomersPage() {
  const { t, locale } = useI18n()
  const { params, set, page } = useUrlParams()
  const status = (FILTERS as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as (typeof FILTERS)[number]) : 'all'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useSearchParamInput(q, set)
  const query = new URLSearchParams({ page: String(page) })
  if (status !== 'all') query.set('status', status)
  if (q) query.set('q', q)
  const list = useQuery({
    queryKey: ['admin', 'customers', { status, q, page }],
    queryFn: () => api<Paged<CustomerRow>>(`/admin/customers?${query}`),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <TopBar title={t.customers.title} />
      <PageBody>
        <PageIntro title={t.customers.title} description={t.customers.description} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs tabs={FILTERS.map((f) => ({ key: f, label: t.customers.filters[f] }))} active={status} onSelect={(k) => set({ status: k === 'all' ? undefined : k, page: undefined })} />
          <SearchBox value={search} onChange={setSearch} placeholder={t.customers.searchPlaceholder} />
        </div>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Users} title={t.customers.emptyTitle} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t.orders.customer}</TableHead>
                    <TableHead>{t.customers.orders}</TableHead>
                    <TableHead>{t.customers.spent}</TableHead>
                    <TableHead>{t.customers.points}</TableHead>
                    <TableHead>{t.customers.joined}</TableHead>
                    <TableHead className="pr-4">{t.common.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="pl-4">
                        <Link to={`/customers/${c.id}`} className="block">
                          <span className="block font-medium hover:underline">{c.name}</span>
                          <span className="block text-xs text-muted-foreground">{c.phone ? formatPhone(c.phone) : c.email}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="tabular-nums">{formatNumber(c.orderCount, locale)}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(c.totalSpent, locale)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(c.pointsBalance, locale)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(c.createdAt, locale)}</TableCell>
                      <TableCell className="pr-4">
                        <span className="flex flex-wrap gap-1">
                          {c.isActive ? <FlagBadge tone="good">{t.common.active}</FlagBadge> : <FlagBadge tone="bad">{t.customers.suspended}</FlagBadge>}
                          {c.shop && <FlagBadge tone="info">{t.customers.seller}</FlagBadge>}
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

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const customer = useQuery({ queryKey: ['admin', 'customers', id], queryFn: () => api<CustomerDetail>(`/admin/customers/${id}`) })
  const orders = useQuery({ queryKey: ['admin', 'orders', { customerId: id }], queryFn: () => api<OrderList>(`/admin/orders?customerId=${id}&pageSize=10`) })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  if (customer.isPending || customer.isError) {
    return (
      <>
        <TopBar title={t.customers.title} backTo="/customers" />
        {customer.isPending ? <LoadingState /> : <ErrorState onRetry={() => void customer.refetch()} />}
      </>
    )
  }
  const c = customer.data
  const toggle = () =>
    setConfirm({
      title: c.isActive ? t.customers.suspend : t.customers.reactivate,
      description: c.isActive ? t.customers.suspendBody : t.customers.reactivateBody,
      confirmLabel: c.isActive ? t.customers.suspend : t.customers.reactivate,
      destructive: c.isActive,
      reason: { required: c.isActive },
      onConfirm: async ({ reason }) => {
        const saved = await send<CustomerDetail>('POST', `/admin/customers/${c.id}/${c.isActive ? 'suspend' : 'reactivate'}`, { reason })
        queryClient.setQueryData(['admin', 'customers', id], saved)
        void queryClient.invalidateQueries({ queryKey: ['admin', 'customers'] })
        toast.success(t.customers.done)
      },
    })

  return (
    <>
      <TopBar title={c.name} backTo="/customers" />
      <PageBody className="max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{c.name}</h2>
              {c.isActive ? <FlagBadge tone="good">{t.common.active}</FlagBadge> : <FlagBadge tone="bad">{t.customers.suspended}</FlagBadge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {t.customers.joined} {formatDate(c.createdAt, locale)}
            </p>
          </div>
          <Button variant={c.isActive ? 'outline' : 'default'} className={c.isActive ? 'text-destructive hover:text-destructive' : ''} onClick={toggle}>
            {c.isActive ? t.customers.suspend : t.customers.reactivate}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t.customers.orders} value={formatNumber(c.orderCount, locale)} />
          <Stat label={t.customers.spent} value={formatMoney(c.totalSpent, locale)} />
          <Stat label={t.customers.points} value={formatNumber(c.pointsBalance, locale)} />
          <Stat label={t.customers.disputes} value={formatNumber(c.disputeCount, locale)} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <Card className="min-w-0 gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t.customers.recentOrders}</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              {orders.data?.items.length ? (
                <Table>
                  <TableBody>
                    {orders.data.items.map((o) => (
                      <TableRow key={o.number}>
                        <TableCell className="pl-6">
                          <Link to={`/orders/${o.number}`} className="font-mono hover:underline">
                            {o.number}
                          </Link>
                        </TableCell>
                        <TableCell>{o.shop.name}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(o.createdAt, locale)}</TableCell>
                        <TableCell className="tabular-nums">{formatMoney(o.total, locale)}</TableCell>
                        <TableCell className="pr-6">
                          <OrderStatusBadge status={o.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="px-6 text-sm text-muted-foreground">{t.orders.emptyTitle}</p>
              )}
            </CardContent>
          </Card>
          <div className="flex flex-col gap-5">
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="text-base">{t.customers.contact}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {c.phone && <p>{formatPhone(c.phone)}</p>}
                {c.email && <p className="break-all">{c.email}</p>}
                <p className="text-muted-foreground">
                  {t.customers.signIn}: {[c.phone && t.customers.phoneVerified, c.linked.google && 'Google', c.linked.apple && 'Apple'].filter(Boolean).join(', ') || '—'}
                </p>
                <p className="text-muted-foreground">
                  {t.customers.sessions}: {c.activeSessions} · {t.customers.addresses}: {c.addressCount} · {t.customers.reviews}: {c.reviewCount}
                </p>
                {c.shop && (
                  <p className="mt-2 flex items-center gap-2">
                    {t.customers.ownsShop}:{' '}
                    <Link to={`/shops/${c.shop.id}`} className="text-primary hover:underline">
                      {c.shop.name}
                    </Link>
                    <ShopStatusBadge status={c.shop.status} />
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="text-base">{t.customers.pointsHistory}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {c.points.length === 0 ? (
                  <p className="text-muted-foreground">{t.customers.noPoints}</p>
                ) : (
                  c.points.map((p) => (
                    <div key={p.id} className="flex justify-between gap-3">
                      <span>
                        <span className="block">{p.note ?? p.type}</span>
                        <span className="text-xs text-muted-foreground">{formatDate(p.createdAt, locale)}</span>
                      </span>
                      <span className={p.points >= 0 ? 'font-medium text-primary tabular-nums' : 'font-medium text-destructive tabular-nums'}>
                        {p.points >= 0 ? '+' : ''}
                        {formatNumber(p.points, locale)}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </PageBody>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}

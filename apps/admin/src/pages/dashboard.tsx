import type { AdminPermission } from '@talad/shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronRight, Gavel, Package, PackageX, ReceiptText, Store, Wallet, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { can, useAuth } from '@/auth/context'
import { ColumnChart } from '@/components/column-chart'
import { FilterTabs } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { compactNumber, fill, formatMoney, formatNumber } from '@/lib/format'
import type { Dashboard, TopRow } from '@/lib/types'

const RANGES = ['7', '30', '90'] as const
const TAGS = { lo: 'lo-LA', en: 'en-GB' } as const

/** Marketplace KPIs, trends and what needs attention (§2.2). */
export function DashboardPage() {
  const { t, locale } = useI18n()
  const { admin } = useAuth()
  const { params, set } = useUrlParams()
  const days = (RANGES as readonly string[]).includes(params.get('days') ?? '') ? params.get('days')! : '30'
  const data = useQuery({
    queryKey: ['admin', 'dashboard', days],
    queryFn: () => api<Dashboard>(`/admin/dashboard?days=${days}`),
    placeholderData: keepPreviousData,
  })
  const dayLabel = (key: string) =>
    new Intl.DateTimeFormat(TAGS[locale], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))

  return (
    <>
      <TopBar title={t.dashboard.title} />
      <PageBody>
        <PageIntro title={t.dashboard.title} description={t.dashboard.description} />
        <FilterTabs tabs={RANGES.map((n) => ({ key: n, label: fill(t.dashboard.days, { n }) }))} active={days} onSelect={(k) => set({ days: k === '30' ? undefined : k })} />
        {data.isPending ? (
          <LoadingState />
        ) : data.isError ? (
          <ErrorState onRetry={() => void data.refetch()} />
        ) : (
          (() => {
            const d = data.data
            const vs = fill(t.dashboard.vsPrevious, { n: d.days })
            const all: { label: string; value: number; to: string; icon: LucideIcon; area: AdminPermission; money?: number }[] = [
              { label: t.dashboard.pendingShops, value: d.alerts.pendingShops, to: '/shops?status=PENDING', icon: Store, area: 'shops.review' },
              { label: t.dashboard.pendingProducts, value: d.alerts.pendingProducts, to: '/products?status=PENDING', icon: Package, area: 'products' },
              { label: t.dashboard.openDisputes, value: d.alerts.openDisputes, to: '/disputes?status=OPEN', icon: Gavel, area: 'disputes' },
              { label: t.dashboard.payoutsDue, value: d.alerts.payoutsDue.count, money: d.alerts.payoutsDue.net, to: '/payouts?status=SCHEDULED', icon: Wallet, area: 'payouts' },
              { label: t.dashboard.unsettledOrders, value: d.alerts.unsettledOrders, to: '/payouts', icon: ReceiptText, area: 'payouts' },
              { label: t.dashboard.lowStock, value: d.alerts.lowStock, to: '/products?status=PUBLISHED', icon: PackageX, area: 'products' },
            ]
            const alerts = all.filter((a) => can(admin, a.area))
            const waiting = alerts.filter((a) => a.value > 0)
            return (
              <>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Tile label={t.dashboard.gmv} value={formatMoney(d.kpis.gmv, locale)} delta={change(d.kpis.gmv, d.previous.gmv)} vs={vs} className="col-span-2" />
                  <Tile label={t.dashboard.orders} value={formatNumber(d.kpis.orders, locale)} delta={change(d.kpis.orders, d.previous.orders)} vs={vs} />
                  <Tile label={t.dashboard.commission} value={formatMoney(d.kpis.commission, locale)} />
                  <Tile label={t.dashboard.activeShops} value={formatNumber(d.kpis.activeShops, locale)} />
                  <Tile label={t.dashboard.activeCustomers} value={formatNumber(d.kpis.activeCustomers, locale)} />
                  <Tile label={t.dashboard.newSignups} value={formatNumber(d.kpis.newSignups, locale)} />
                  <Tile label={t.dashboard.refundRate} value={`${d.kpis.refundRate}%`} />
                </div>

                <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
                  <Card className="min-w-0 gap-3">
                    <CardHeader>
                      <CardTitle className="text-base">{t.dashboard.dailyGmv}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ColumnChart
                        data={d.series.map((s) => ({ key: s.date, value: s.gmv }))}
                        label={fill(t.dashboard.chartLabel, { n: d.days })}
                        format={(v) => formatMoney(v, locale)}
                        formatTick={(v) => compactNumber(v, locale)}
                        formatKey={dayLabel}
                        detail={(i) => `${formatNumber(d.series[i].orders, locale)} ${t.dashboard.orders}`}
                      />
                      <details className="mt-4 text-sm">
                        <summary className="cursor-pointer text-primary">{t.dashboard.showTable}</summary>
                        <Table className="mt-2">
                          <TableHeader>
                            <TableRow>
                              <TableHead>{t.dashboard.date}</TableHead>
                              <TableHead className="text-right">{t.dashboard.orders}</TableHead>
                              <TableHead className="text-right">{t.dashboard.gmv}</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...d.series].reverse().map((s) => (
                              <TableRow key={s.date}>
                                <TableCell>{dayLabel(s.date)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatNumber(s.orders, locale)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatMoney(s.gmv, locale)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </details>
                    </CardContent>
                  </Card>

                  <Card className="gap-2 self-start">
                    <CardHeader>
                      <CardTitle className="text-base">{t.dashboard.needsAttention}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col">
                      {waiting.length === 0 ? (
                        <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="size-4 text-primary" />
                          {t.dashboard.allClear}
                        </p>
                      ) : (
                        waiting.map((a) => (
                          <Link key={a.label} to={a.to} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted">
                            <span className="flex size-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              <a.icon className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1 text-sm">
                              {a.label}
                              {a.money !== undefined && <span className="block text-xs text-muted-foreground">{formatMoney(a.money, locale)}</span>}
                            </span>
                            <span className="text-lg font-semibold tabular-nums">{formatNumber(a.value, locale)}</span>
                            <ChevronRight className="size-4 text-muted-foreground" />
                          </Link>
                        ))
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-5 lg:grid-cols-3">
                  <TopList title={t.dashboard.topShops} rows={d.top.shops} to={(id) => `/shops/${id}`} />
                  <TopList title={t.dashboard.topCategories} rows={d.top.categories} />
                  <TopList title={t.dashboard.topProducts} rows={d.top.products} to={(id) => `/products/${id}`} />
                </div>
              </>
            )
          })()
        )}
      </PageBody>
    </>
  )
}

function change(now: number, before: number): number | null {
  return before === 0 ? null : Math.round(((now - before) / before) * 100)
}

function Tile({ label, value, delta, vs, className }: { label: string; value: string; delta?: number | null; vs?: string; className?: string }) {
  const up = (delta ?? 0) >= 0
  return (
    <Card className={cn('gap-1 py-4', className)}>
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="truncate text-xl font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {delta !== undefined && delta !== null && (
        <CardContent className="flex items-center gap-1 px-4 text-xs">
          <span className={cn('inline-flex items-center font-medium', up ? 'text-primary' : 'text-destructive')}>
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {up ? '+' : '−'}
            {Math.abs(delta)}%
          </span>
          <span className="truncate text-muted-foreground">{vs}</span>
        </CardContent>
      )}
    </Card>
  )
}

/** Ranked list with a bar relative to the leader; the money figure beside it is the value. */
function TopList({ title, rows, to }: { title: string; rows: TopRow[]; to?: (id: string) => string }) {
  const { t, locale } = useI18n()
  const max = rows[0]?.revenue ?? 0
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.dashboard.noSales}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {rows.map((r, i) => {
              const body = (
                <>
                  <span className="w-4 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.name}</span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-chart-series" style={{ width: `${Math.max(4, (r.revenue / (max || 1)) * 100)}%` }} />
                    </span>
                  </span>
                  <span className="text-right text-sm tabular-nums">
                    <span className="block font-medium">{formatMoney(r.revenue, locale)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatNumber(r.orders, locale)} {t.dashboard.orders}
                    </span>
                  </span>
                </>
              )
              return (
                <li key={r.id}>
                  {to ? (
                    <Link to={to(r.id)} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-muted">
                      {body}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-3">{body}</span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}

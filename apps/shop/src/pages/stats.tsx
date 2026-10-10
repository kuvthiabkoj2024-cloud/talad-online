import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, BarChart3, ImageOff } from 'lucide-react'
import { ColumnChart } from '@/components/column-chart'
import { FilterTabs } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { fill, formatMoney, formatNumber } from '@/lib/format'
import type { ShopStats } from '@/lib/types'

const RANGES = ['7', '30', '90'] as const
const TAGS = { lo: 'lo-LA', en: 'en-GB' } as const

/** Sales over time and best sellers (§3.7). `?days=7|30|90` */
export function StatsPage() {
  const { t, locale } = useI18n()
  const { params, set } = useUrlParams()
  const days = (RANGES as readonly string[]).includes(params.get('days') ?? '') ? params.get('days')! : '30'
  const stats = useQuery({
    queryKey: ['shop', 'stats', days],
    queryFn: () => api<ShopStats>(`/me/shop/stats?days=${days}`),
    placeholderData: keepPreviousData,
  })

  const compact = new Intl.NumberFormat(TAGS[locale], { notation: 'compact', maximumFractionDigits: 1 })
  const dayLabel = (key: string) =>
    new Intl.DateTimeFormat(TAGS[locale], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))

  return (
    <>
      <TopBar title={t.stats.title} backTo="/" />
      <PageBody>
        <PageIntro title={t.stats.title} description={t.stats.description} />
        <FilterTabs
          tabs={RANGES.map((n) => ({ key: n, label: fill(t.stats.days, { n }) }))}
          active={days}
          onSelect={(k) => set({ days: k === '30' ? undefined : k })}
        />
        {stats.isPending ? (
          <LoadingState />
        ) : stats.isError ? (
          <ErrorState onRetry={() => void stats.refetch()} />
        ) : (
          (() => {
            const s = stats.data
            const empty = s.totals.orders === 0
            return (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Tile
                    label={t.stats.revenue}
                    value={formatMoney(s.totals.revenue, locale)}
                    delta={change(s.totals.revenue, s.previous.revenue)}
                    vs={fill(t.stats.vsPrevious, { n: s.days })}
                    className="col-span-2 lg:col-span-1"
                  />
                  <Tile label={t.stats.orders} value={formatNumber(s.totals.orders, locale)} delta={change(s.totals.orders, s.previous.orders)} vs={fill(t.stats.vsPrevious, { n: s.days })} />
                  <Tile label={t.stats.customers} value={formatNumber(s.totals.customers, locale)} />
                  <Tile label={t.stats.averageOrder} value={formatMoney(s.totals.averageOrder, locale)} />
                  <Tile label={t.stats.units} value={formatNumber(s.totals.units, locale)} />
                </div>

                {empty ? (
                  <EmptyState icon={BarChart3} title={t.stats.noSales} />
                ) : (
                  <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
                    <div className="flex min-w-0 flex-col gap-5">
                      <Card className="gap-3">
                        <CardHeader>
                          <CardTitle className="text-base">{t.stats.dailyRevenue}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ColumnChart
                            data={s.series.map((d) => ({ key: d.date, value: d.revenue }))}
                            label={fill(t.stats.chartLabel, { n: s.days })}
                            format={(v) => formatMoney(v, locale)}
                            formatTick={(v) => compact.format(v)}
                            formatKey={dayLabel}
                            detail={(i) => `${formatNumber(s.series[i].orders, locale)} ${t.stats.orders}`}
                          />
                        </CardContent>
                      </Card>
                      <Card className="gap-3">
                        <CardHeader>
                          <CardTitle className="text-base">{t.stats.dailyOrders}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ColumnChart
                            data={s.series.map((d) => ({ key: d.date, value: d.orders }))}
                            label={t.stats.dailyOrders}
                            format={(v) => `${formatNumber(v, locale)} ${t.stats.orders}`}
                            formatTick={(v) => formatNumber(v, locale)}
                            formatKey={dayLabel}
                            integer
                          />
                          {/* The same numbers without the chart (screen readers, exact values). */}
                          <details className="mt-4 text-sm">
                            <summary className="cursor-pointer text-primary">{t.stats.showTable}</summary>
                            <Table className="mt-2">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>{t.stats.date}</TableHead>
                                  <TableHead className="text-right">{t.stats.orders}</TableHead>
                                  <TableHead className="text-right">{t.stats.revenue}</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {[...s.series].reverse().map((d) => (
                                  <TableRow key={d.date}>
                                    <TableCell>{dayLabel(d.date)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatNumber(d.orders, locale)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{formatMoney(d.revenue, locale)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </details>
                        </CardContent>
                      </Card>
                    </div>

                    <Card className="gap-3 self-start">
                      <CardHeader>
                        <CardTitle className="text-base">{t.stats.topProducts}</CardTitle>
                        <CardDescription>{fill(t.stats.days, { n: s.days })}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ol className="flex flex-col gap-3">
                          {s.topProducts.map((p, i) => {
                            const share = s.topProducts[0].revenue ? p.revenue / s.topProducts[0].revenue : 0
                            return (
                              <li key={p.productId} className="flex items-center gap-3">
                                <span className="w-4 text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : <ImageOff className="size-4" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm">{p.name}</span>
                                  {/* Relative to the best seller; the number beside it is the value. */}
                                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted">
                                    <span className="block h-full rounded-full bg-chart-series" style={{ width: `${Math.max(4, share * 100)}%` }} />
                                  </span>
                                </span>
                                <span className="text-right text-sm tabular-nums">
                                  <span className="block font-medium">{formatMoney(p.revenue, locale)}</span>
                                  <span className="block text-xs text-muted-foreground">{fill(t.stats.sold, { n: p.units })}</span>
                                </span>
                              </li>
                            )
                          })}
                        </ol>
                        <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                          {t.stats.views}: <span className="font-medium text-foreground tabular-nums">{formatNumber(s.productViews, locale)}</span>
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )
          })()
        )}
      </PageBody>
    </>
  )
}

/** Percentage change, or null when there's nothing to compare against. */
function change(now: number, before: number): number | null {
  if (before === 0) return null
  return Math.round(((now - before) / before) * 100)
}

function Tile({ label, value, delta, vs, className }: { label: string; value: string; delta?: number | null; vs?: string; className?: string }) {
  const up = (delta ?? 0) >= 0
  return (
    <Card className={cn('gap-1 py-4', className)}>
      <CardHeader className="px-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-xl font-semibold tabular-nums sm:text-2xl">{value}</CardTitle>
      </CardHeader>
      {delta !== undefined && delta !== null && (
        <CardContent className="flex items-center gap-1 px-4 text-xs">
          <span className={cn('inline-flex items-center font-medium', up ? 'text-primary' : 'text-destructive')}>
            {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {up ? '+' : '−'}
            {Math.abs(delta)}%
          </span>
          <span className="text-muted-foreground">{vs}</span>
        </CardContent>
      )}
    </Card>
  )
}

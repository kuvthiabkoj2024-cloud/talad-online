import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Crown,
  Eye,
  ImageOff,
  Package,
  ReceiptText,
  ShoppingBag,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { ColumnChart } from '@/components/column-chart'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { SalesChart } from '@/components/sales-chart'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { fill, formatMoney, formatNumber } from '@/lib/format'
import type { ShopStats } from '@/lib/types'

const RANGES = ['7', '30', '90'] as const
const TAGS = { lo: 'lo-LA', en: 'en-GB' } as const
type Metric = 'revenue' | 'orders'
type View = 'running' | 'daily'

/**
 * Seller Center home: sales over time, how the shop is doing against the previous period,
 * and what sells (§3.7). `?days=7|30|90`
 */
export function StatsPage({ asHome = false }: { asHome?: boolean }) {
  const { t } = useI18n()
  // Desktop shows it as the home page; phones open it from the home grid's ໜ້າຫຼັກ tile.
  const title = asHome ? t.home.title : t.nav.home
  const { params, set } = useUrlParams()
  const days = (RANGES as readonly string[]).includes(params.get('days') ?? '') ? params.get('days')! : '30'
  const stats = useQuery({
    queryKey: ['shop', 'stats', days],
    queryFn: () => api<ShopStats>(`/me/shop/stats?days=${days}`),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <TopBar title={title} backTo={asHome ? undefined : '/'} />
      <PageBody>
        <PageIntro
          title={title}
          description={t.stats.description}
          actions={
            <Segmented
              options={RANGES.map((n) => ({ key: n, label: fill(t.stats.days, { n }) }))}
              value={days}
              onChange={(k) => set({ days: k === '30' ? undefined : k })}
              label={t.stats.title}
            />
          }
        />
        {stats.isPending ? (
          <LoadingState />
        ) : stats.isError ? (
          <ErrorState onRetry={() => void stats.refetch()} />
        ) : (
          <Dashboard s={stats.data} refreshing={stats.isFetching} />
        )}
      </PageBody>
    </>
  )
}

function Dashboard({ s, refreshing }: { s: ShopStats; refreshing: boolean }) {
  const { t, locale } = useI18n()
  const vs = fill(t.stats.vsPrevious, { n: s.days })
  return (
    <div className={cn('flex flex-col gap-5 transition-opacity', refreshing && 'opacity-60')}>
      {/* One slim strip: four cells split by hairlines (2 × 2 on phones). */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-border shadow-xs ring-1 ring-border lg:grid-cols-4">
        <Kpi icon={ReceiptText} tone="emerald" label={t.stats.orders} value={formatNumber(s.totals.orders, locale)} delta={change(s.totals.orders, s.previous.orders)} vs={vs} />
        <Kpi icon={Users} tone="sky" label={t.stats.customers} value={formatNumber(s.totals.customers, locale)} delta={change(s.totals.customers, s.previous.customers)} vs={vs} />
        <Kpi icon={Wallet} tone="amber" label={t.stats.averageOrder} value={formatMoney(s.totals.averageOrder, locale)} delta={change(s.totals.averageOrder, s.previous.averageOrder)} vs={vs} />
        <Kpi icon={Package} tone="violet" label={t.stats.units} value={formatNumber(s.totals.units, locale)} delta={change(s.totals.units, s.previous.units)} vs={vs} />
      </div>

      <SalesCard s={s} />

      {s.totals.orders > 0 && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <TopProducts s={s} />
          <div className="flex min-w-0 flex-col gap-5">
            <Breakdown
              title={t.stats.byStatus}
              rows={Object.entries(s.statusCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([status, n]) => ({
                  key: status,
                  label: t.orders.status[status as keyof typeof t.orders.status] ?? status,
                  value: n === 1 ? t.stats.orderCount : fill(t.stats.ordersCount, { n: formatNumber(n, locale) }),
                  share: n / Math.max(1, ...Object.values(s.statusCounts)),
                  muted: status === 'CANCELLED',
                }))}
            />
            <Breakdown
              title={t.stats.byPayment}
              rows={s.payments.map((p) => ({
                key: p.method,
                label: t.orders.methods[p.method as keyof typeof t.orders.methods] ?? p.method,
                value: formatMoney(p.revenue, locale),
                hint: fill(t.stats.ofRevenue, { p: s.totals.revenue ? Math.round((p.revenue / s.totals.revenue) * 100) : 0 }),
                share: p.revenue / Math.max(1, ...s.payments.map((x) => x.revenue)),
              }))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** The headline: total sales, the change, and the sales graph against the previous period. */
function SalesCard({ s }: { s: ShopStats }) {
  const { t, locale } = useI18n()
  const [metric, setMetric] = useState<Metric>('revenue')
  const [view, setView] = useState<View>('running')
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
  const dayLabel = (key: string) => new Intl.DateTimeFormat(TAGS[locale], { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T00:00:00Z`))
  const value = (d: { orders: number; revenue: number }) => (metric === 'revenue' ? d.revenue : d.orders)
  const format = (v: number) => (metric === 'revenue' ? formatMoney(v, locale) : v === 1 ? t.stats.orderCount : fill(t.stats.ordersCount, { n: formatNumber(v, locale) }))
  const total = metric === 'revenue' ? s.totals.revenue : s.totals.orders
  const before = metric === 'revenue' ? s.previous.revenue : s.previous.orders
  const metricName = metric === 'revenue' ? t.stats.metricRevenue : t.stats.metricOrders
  const best = s.series.reduce((a, d) => (value(d) > value(a) ? d : a), s.series[0])

  // Running totals make a few sales days read as a trend; "per day" shows each day.
  const current = s.series.map(value)
  const previous = s.previousSeries.map(value)
  const shown = view === 'running' ? runningTotal(current) : current
  const shownPrevious = view === 'running' ? runningTotal(previous) : previous
  const points = s.series.map((d, i) => ({
    key: d.date,
    value: shown[i],
    previous: i < shownPrevious.length ? shownPrevious[i] : null,
    previousKey: s.previousSeries[i]?.date ?? null,
  }))

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-wrap items-start justify-between gap-4 bg-gradient-to-br from-brand-soft/70 via-card to-card px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <ShoppingBag className="size-4" />
            </span>
            {t.stats.sales} · {fill(t.stats.thisPeriod, { n: s.days })}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">{format(total)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <Delta value={change(total, before)} />
            <span className="text-muted-foreground">
              {change(total, before) === null ? t.stats.noPrevious : `${fill(t.stats.vsPrevious, { n: s.days })} · ${format(before)}`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            options={[
              { key: 'revenue', label: t.stats.metricRevenue },
              { key: 'orders', label: t.stats.metricOrders },
            ]}
            value={metric}
            onChange={setMetric}
            label={t.stats.sales}
          />
          <Segmented
            options={[
              { key: 'running', label: t.stats.running },
              { key: 'daily', label: t.stats.perDay },
            ]}
            value={view}
            onChange={setView}
            label={t.stats.sales}
          />
        </div>
      </div>

      <CardContent className="px-3 pt-2 pb-4 sm:px-5">
        {s.totals.orders === 0 && s.previous.orders === 0 ? (
          <EmptyState icon={BarChart3} title={t.stats.noSales} className="my-4 border-none" />
        ) : (
          <>
            {/* Legend (the comparison line is also dashed, so it's not colour alone). */}
            <div className="mb-1 flex flex-wrap items-center gap-x-5 gap-y-1 px-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-full bg-chart-series" />
                {fill(t.stats.thisPeriod, { n: s.days })}
              </span>
              {view === 'running' && (
                <span className="flex items-center gap-1.5">
                  <span className="w-4 border-t-2 border-dashed border-muted-foreground/70" />
                  {fill(t.stats.previousPeriod, { n: s.days })}
                </span>
              )}
              {best && value(best) > 0 && (
                <span className="ml-auto flex items-center gap-1.5">
                  <Crown className="size-3.5 text-amber-500" />
                  {t.stats.bestDay}: <span className="font-medium text-foreground">{dayLabel(best.date)}</span> · <span className="tabular-nums">{format(value(best))}</span>
                </span>
              )}
            </div>
            {view === 'running' ? (
              <SalesChart
                key={metric}
                data={points}
                label={fill(t.stats.salesChart, { metric: metricName, n: s.days })}
                format={format}
                formatTick={(v) => (metric === 'revenue' ? compact.format(v) : formatNumber(v, locale))}
                formatKey={dayLabel}
                currentLabel={fill(t.stats.thisPeriod, { n: s.days })}
                previousLabel={fill(t.stats.previousPeriod, { n: s.days })}
                integer={metric === 'orders'}
              />
            ) : (
              <ColumnChart
                key={metric}
                data={points.map((p) => ({ key: p.key, value: p.value }))}
                label={fill(t.stats.perDayChart, { metric: metricName, n: s.days })}
                format={format}
                formatTick={(v) => (metric === 'revenue' ? compact.format(v) : formatNumber(v, locale))}
                formatKey={dayLabel}
                detail={(i) => (metric === 'revenue' ? fill(t.stats.ordersCount, { n: formatNumber(s.series[i].orders, locale) }) : formatMoney(s.series[i].revenue, locale))}
                integer={metric === 'orders'}
              />
            )}
            {/* The same numbers without the chart (screen readers, exact values). */}
            <details className="mt-3 px-2 text-sm">
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
          </>
        )}
      </CardContent>
    </Card>
  )
}

function TopProducts({ s }: { s: ShopStats }) {
  const { t, locale } = useI18n()
  const best = s.topProducts[0]?.revenue ?? 0
  return (
    <Card className="gap-4">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="size-4 text-amber-500" />
            {t.stats.topProducts}
          </CardTitle>
          <CardDescription>{fill(t.stats.thisPeriod, { n: s.days })}</CardDescription>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <Eye className="size-3.5" />
          <span className="tabular-nums">{formatNumber(s.productViews, locale)}</span>
        </span>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col gap-1">
          {s.topProducts.map((p, i) => (
            <li key={p.productId} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-muted/60">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums',
                  i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' : 'bg-muted text-muted-foreground',
                )}
              >
                {i + 1}
              </span>
              <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground ring-1 ring-border">
                {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : <ImageOff className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.name}</span>
                {/* Relative to the best seller; the number beside it is the value. */}
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-chart-series" style={{ width: `${Math.max(4, best ? (p.revenue / best) * 100 : 0)}%` }} />
                </span>
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                <span className="block font-semibold">{formatMoney(p.revenue, locale)}</span>
                <span className="block text-xs text-muted-foreground">{fill(t.stats.sold, { n: p.units })}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

/** One measure split by a category: a row per value with a single-hue bar (relative to the largest). */
function Breakdown({ title, rows }: { title: string; rows: { key: string; label: string; value: string; hint?: string; share: number; muted?: boolean }[] }) {
  if (!rows.length) return null
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate">{r.label}</span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-medium">{r.value}</span>
                  {r.hint && <span className="ml-1.5 text-xs text-muted-foreground">{r.hint}</span>}
                </span>
              </div>
              <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-muted">
                <span className={cn('block h-full rounded-full', r.muted ? 'bg-muted-foreground/40' : 'bg-chart-series')} style={{ width: `${Math.max(3, r.share * 100)}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** 1, 2, 0, 3 → 1, 3, 3, 6. */
function runningTotal(values: number[]): number[] {
  return values.reduce<number[]>((acc, v) => [...acc, (acc.at(-1) ?? 0) + v], [])
}

/** Percentage change, or null when there's nothing to compare against. */
function change(now: number, before: number): number | null {
  if (before === 0) return null
  return Math.round(((now - before) / before) * 100)
}

function Delta({ value }: { value: number | null }) {
  if (value === null) return null
  const up = value >= 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums',
        up ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
      )}
    >
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {up ? '+' : '−'}
      {Math.abs(value)}%
    </span>
  )
}

const KPI_TONES = {
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
  sky: 'bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-400',
  amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400',
} as const

function Kpi({
  icon: Icon,
  tone,
  label,
  value,
  delta,
  vs,
}: {
  icon: LucideIcon
  tone: keyof typeof KPI_TONES
  label: string
  value: string
  delta: number | null
  vs: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 bg-card px-3 py-3 sm:px-4">
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', KPI_TONES[tone])}>
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-lg leading-tight font-bold tracking-tight tabular-nums">{value}</p>
      </div>
      {delta !== null && (
        <span title={vs} className="shrink-0 max-sm:hidden">
          <Delta value={delta} />
        </span>
      )}
    </div>
  )
}

/** A compact segmented control (one choice from a few). */
function Segmented<K extends string>({ options, value, onChange, label }: { options: { key: K; label: string }[]; value: K; onChange: (key: K) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-muted p-1">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="radio"
          aria-checked={o.key === value}
          onClick={() => onChange(o.key)}
          className={cn(
            'rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all',
            o.key === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

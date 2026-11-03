import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download, ImageOff, LoaderCircle, ReceiptText, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FilterTabs } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api, getToken } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber } from '@/lib/format'
import type { ShopFinance, ShopPayout } from '@/lib/types'

const PERIODS = ['this-month', 'last-month', 'last-90', 'this-year'] as const
type Period = (typeof PERIODS)[number]

function range(p: Period): { from: Date; to: Date } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (p) {
    case 'last-month':
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }
    case 'last-90':
      return { from: new Date(now.getTime() - 90 * 86_400_000), to: now }
    case 'this-year':
      return { from: new Date(y, 0, 1), to: now }
    default:
      return { from: new Date(y, m, 1), to: now }
  }
}

/** Earnings, commission, payouts and statements (§3.7). */
export function FinancePage() {
  const { t, locale } = useI18n()
  const { params, set } = useUrlParams()
  const period = (PERIODS as readonly string[]).includes(params.get('period') ?? '') ? (params.get('period') as Period) : 'this-month'
  const { from, to } = range(period)
  // Whole minutes, so the query key (and cache) is stable while the page is open.
  const qs = new URLSearchParams({ from: new Date(Math.floor(from.getTime() / 60_000) * 60_000).toISOString(), to: new Date(Math.ceil(to.getTime() / 60_000) * 60_000).toISOString() })
  const data = useQuery({
    queryKey: ['shop', 'finance', period],
    queryFn: () => api<ShopFinance>(`/me/shop/finance?${qs}`),
    placeholderData: keepPreviousData,
  })
  const [downloading, setDownloading] = useState(false)

  async function download() {
    setDownloading(true)
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/me/shop/finance/statement?${qs}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error(String(res.status))
      const a = document.createElement('a')
      a.href = URL.createObjectURL(await res.blob())
      a.download = `mcmart-statement-${qs.get('from')!.slice(0, 10)}-${qs.get('to')!.slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast.error(t.common.loadError)
    } finally {
      setDownloading(false)
    }
  }

  const labels: Record<Period, string> = {
    'this-month': t.finance.thisMonth,
    'last-month': t.finance.lastMonth,
    'last-90': t.finance.last90,
    'this-year': t.finance.thisYear,
  }

  return (
    <>
      <TopBar title={t.finance.title} backTo="/" />
      <PageBody>
        <PageIntro
          title={t.finance.title}
          description={t.finance.description}
          actions={
            <Button variant="outline" onClick={() => void download()} disabled={downloading}>
              {downloading ? <LoaderCircle className="animate-spin" /> : <Download />}
              {t.finance.download}
            </Button>
          }
        />
        <FilterTabs tabs={PERIODS.map((key) => ({ key, label: labels[key] }))} active={period} onSelect={(k) => set({ period: k === 'this-month' ? undefined : k })} />

        {data.isPending ? (
          <LoadingState />
        ) : data.isError ? (
          <ErrorState onRetry={() => void data.refetch()} />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="gap-1 bg-primary text-primary-foreground sm:col-span-2">
                <CardHeader>
                  <CardDescription className="text-primary-foreground/80">{t.finance.net}</CardDescription>
                  <CardTitle className="text-3xl tabular-nums">{formatMoney(data.data.earned.net, locale)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-primary-foreground/80">
                  {t.finance.earned} · {fill(t.finance.orderCount, { n: formatNumber(data.data.earned.orders, locale) })}
                </CardContent>
              </Card>
              <Kpi
                label={t.finance.gross}
                value={formatMoney(data.data.earned.gross, locale)}
                hint={data.data.earned.discounts.platformCoupons > 0 ? fill(t.finance.grossHint, { amount: formatMoney(data.data.earned.discounts.platformCoupons, locale) }) : undefined}
              />
              <Kpi label={t.finance.commission} value={`−${formatMoney(data.data.earned.commission, locale)}`} />
              <Kpi
                label={t.finance.inProgress}
                value={formatMoney(data.data.inProgress.amount, locale)}
                hint={fill(t.finance.inProgressHint, { n: data.data.inProgress.orders })}
              />
              <Kpi label={t.finance.refunded} value={formatMoney(data.data.refunded.amount, locale)} hint={fill(t.finance.orderCount, { n: formatNumber(data.data.refunded.orders, locale) })} />
              <Kpi
                label={t.finance.pending}
                value={formatMoney(Math.max(0, data.data.pending.amount), locale)}
                hint={fill(t.finance.pendingCount, { n: formatNumber(data.data.pending.count, locale) })}
                className="sm:col-span-2"
              />
            </div>

            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t.finance.discountsTitle}</CardTitle>
                <CardDescription>{t.finance.discountsHint}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-px overflow-hidden rounded-xl bg-border p-0 ring-1 ring-border sm:grid-cols-3 mx-4">
                {(['flashSale', 'shopCoupons', 'platformCoupons'] as const).map((k) => (
                  <div key={k} className="flex flex-col gap-0.5 bg-card px-4 py-3">
                    <span className="text-xs text-muted-foreground">{t.finance[k]}</span>
                    <span className={cn('text-lg font-semibold tabular-nums', k === 'platformCoupons' && 'text-primary')}>
                      {k === 'platformCoupons' ? '+' : '−'}
                      {formatMoney(data.data.earned.discounts[k], locale)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <PendingPayouts pending={data.data.pending} />

            <Card className="gap-3">
              <CardHeader>
                <CardTitle>{t.finance.payouts}</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                {data.data.payouts.length === 0 ? (
                  <EmptyState icon={Wallet} title={t.finance.noPayouts} className="mx-6 border-0 py-6" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">{t.finance.payoutPeriod}</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">{t.finance.gross}</TableHead>
                        <TableHead className="hidden text-right sm:table-cell">{t.finance.commission}</TableHead>
                        <TableHead className="pr-6 text-right sm:pr-2">{t.finance.net}</TableHead>
                        <TableHead className="hidden pr-6 sm:table-cell">{t.products.status}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.data.payouts.map((p) => (
                        <PayoutRow key={p.id} payout={p} />
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </PageBody>
    </>
  )
}

/** What MC Mart still owes: batches not paid yet, then completed orders not in a batch. */
function PendingPayouts({ pending }: { pending: ShopFinance['pending'] }) {
  const { t, locale } = useI18n()
  const hidden = pending.ordersTotal - pending.orders.length
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {t.finance.pendingTitle}
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 tabular-nums dark:bg-amber-950 dark:text-amber-200">{formatNumber(pending.count, locale)}</span>
          </CardTitle>
          <CardDescription>{t.finance.pendingHint}</CardDescription>
        </div>
        <span className="text-xl font-semibold tabular-nums">{formatMoney(Math.max(0, pending.amount), locale)}</span>
      </CardHeader>
      <CardContent className="px-0">
        {pending.count === 0 ? (
          <EmptyState icon={Wallet} title={t.finance.noPending} className="mx-6 border-0 py-6" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">{t.finance.pendingItem}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t.finance.gross}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t.finance.commission}</TableHead>
                <TableHead className="pr-6 text-right sm:pr-2">{t.finance.net}</TableHead>
                <TableHead className="hidden pr-6 sm:table-cell">{t.products.status}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.payouts.map((p) => (
                <PayoutRow key={p.id} payout={p} />
              ))}
              {pending.orders.map((o) => (
                <TableRow key={o.number}>
                  <TableCell className="pl-6">
                    <span className="flex items-center gap-3">
                      <span className="flex h-16 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <ReceiptText className="size-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <Link to={`/orders/${o.number}`} className="block font-mono font-medium hover:underline">
                          {o.number}
                        </Link>
                        {o.completedAt && <span className="block text-xs text-muted-foreground">{fill(t.finance.completedOn, { date: formatDate(o.completedAt, locale) })}</span>}
                        <span className="mt-1 block sm:hidden">
                          <PendingOrderStatus order={o} />
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">–</TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">–</TableCell>
                  <TableCell className="pr-6 text-right font-medium tabular-nums sm:pr-2">{formatMoney(o.net, locale)}</TableCell>
                  <TableCell className="hidden pr-6 sm:table-cell">
                    <PendingOrderStatus order={o} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {hidden > 0 && <p className="px-6 pt-3 text-xs text-muted-foreground">{fill(t.finance.pendingMore, { n: formatNumber(hidden, locale) })}</p>}
      </CardContent>
    </Card>
  )
}

function PendingOrderStatus({ order: o }: { order: ShopFinance['pending']['orders'][number] }) {
  const { t, locale } = useI18n()
  if (o.ready || !o.readyAt) return <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-200">{t.finance.orderReady}</span>
  return (
    <>
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">{t.finance.orderWaiting}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{fill(t.finance.orderWaitingUntil, { date: formatDate(o.readyAt, locale) })}</span>
    </>
  )
}

function PayoutStatus({ payout: p }: { payout: ShopPayout }) {
  const { t, locale } = useI18n()
  return (
    <>
      <span
        className={cn(
          'rounded-full px-2 py-0.5 text-xs font-medium',
          p.status === 'PAID' ? 'bg-brand-soft text-primary' : p.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
        )}
      >
        {t.finance.payoutStatus[p.status]}
      </span>
      {p.paidAt && <span className="mt-0.5 block text-xs text-muted-foreground">{formatDate(p.paidAt, locale)}</span>}
    </>
  )
}

function PayoutRow({ payout: p }: { payout: ShopPayout }) {
  const { t, locale } = useI18n()
  return (
    <TableRow>
      <TableCell className="pl-6">
        <span className="flex items-center gap-3">
          <PayoutSlip id={p.id} hasSlip={p.hasSlip} />
          <span className="min-w-0">
            <span className="block whitespace-normal">
              {formatDate(p.periodStart, locale)} – {formatDate(p.periodEnd, locale)}
            </span>
            {p.reference && <span className="block font-mono text-xs text-muted-foreground">{fill(t.finance.reference, { ref: p.reference })}</span>}
            <span className="mt-1 block sm:hidden">
              <PayoutStatus payout={p} />
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatMoney(p.gross, locale)}</TableCell>
      <TableCell className="hidden text-right text-muted-foreground tabular-nums sm:table-cell">−{formatMoney(p.commission, locale)}</TableCell>
      <TableCell className="pr-6 text-right font-medium tabular-nums sm:pr-2">{formatMoney(p.net, locale)}</TableCell>
      <TableCell className="hidden pr-6 sm:table-cell">
        <PayoutStatus payout={p} />
      </TableCell>
    </TableRow>
  )
}

function Kpi({ label, value, hint, className }: { label: string; value: string; hint?: string; className?: string }) {
  return (
    <Card className={cn('gap-1', className)}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  )
}

/** MC Mart's transfer slip at the front of a payout's row: a thumbnail, full size in a pop-up. It's private, so it's fetched with the session. */
function PayoutSlip({ id, hasSlip }: { id: string; hasSlip: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const slip = useQuery({
    queryKey: ['shop', 'payout-slip', id],
    enabled: hasSlip,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/me/shop/finance/payouts/${id}/slip`, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (!res.ok) throw new Error(String(res.status))
      return URL.createObjectURL(await res.blob())
    },
  })
  const frame = 'flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground'
  // No slip yet (not paid, or paid without one): an empty frame keeps the rows lined up.
  if (!hasSlip) {
    return (
      <span className={frame} title={t.finance.noSlip}>
        <ReceiptText className="size-4" aria-hidden />
        <span className="sr-only">{t.finance.noSlip}</span>
      </span>
    )
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t.finance.viewSlip} className={cn(frame, 'ring-1 ring-border transition hover:ring-primary/50')}>
        {slip.isPending ? <LoaderCircle className="size-4 animate-spin" /> : slip.data ? <img src={slip.data} alt="" className="size-full object-cover" /> : <ImageOff className="size-4" />}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.finance.slip}</DialogTitle>
            <DialogDescription className="sr-only">{t.finance.slip}</DialogDescription>
          </DialogHeader>
          {slip.data ? (
            <img src={slip.data} alt={t.finance.slip} className="max-h-[75svh] w-full rounded-lg object-contain" />
          ) : slip.isPending ? (
            <LoaderCircle className="mx-auto my-16 size-6 animate-spin text-muted-foreground" />
          ) : (
            <ImageOff className="mx-auto my-16 size-6 text-muted-foreground" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

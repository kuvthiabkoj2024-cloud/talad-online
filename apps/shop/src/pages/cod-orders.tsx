import { LAO_BANKS, type BankCode } from '@talad/shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarClock, HandCoins, ImageOff, LoaderCircle, Truck } from 'lucide-react'
import { Link } from 'react-router'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { queryKeys } from '@/hooks/queries'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api, getToken } from '@/lib/api'
import { fill, formatDate, formatMoney } from '@/lib/format'
import type { CodMonth, ShopProfile } from '@/lib/types'

/** `YYYY-MM` of the last 12 months in Laos time, newest first. */
function lastMonths(): string[] {
  const now = new Date(Date.now() + 7 * 3_600_000)
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    return d.toISOString().slice(0, 7)
  })
}

/**
 * Cash-on-delivery orders: the shop keeps the cash, so at the end of each month it transfers
 * Taladonline's commission on that month's completed COD sales.
 */
export function CodOrdersPage() {
  const { t, locale } = useI18n()
  const c = t.codOrders
  const { params, set } = useUrlParams()
  const months = lastMonths()
  const month = months.includes(params.get('month') ?? '') ? params.get('month')! : months[0]
  const data = useQuery({
    queryKey: ['shop', 'cod', month],
    queryFn: () => api<CodMonth>(`/me/shop/cod?month=${month}`),
    placeholderData: keepPreviousData,
  })
  const profile = useQuery({ queryKey: queryKeys.profile, queryFn: () => api<ShopProfile>('/me/shop/profile') })
  const monthName = (m: string) => new Intl.DateTimeFormat(locale === 'lo' ? 'lo-LA' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))

  return (
    <>
      <TopBar title={c.title} backTo="/" />
      <PageBody>
        <PageIntro title={c.title} description={c.description} />
        {profile.data && !profile.data.cod.enabled && (
          <Link to="/profile" className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground hover:underline">
            {c.codOff} {c.turnOn} →
          </Link>
        )}
        <label className="flex items-center gap-2 self-start text-sm">
          <span className="text-muted-foreground">{c.month}</span>
          <select value={month} onChange={(e) => set({ month: e.target.value === months[0] ? undefined : e.target.value })} className="h-9 rounded-md border bg-background px-3 text-sm font-medium">
            {months.map((m) => (
              <option key={m} value={m}>
                {monthName(m)}
              </option>
            ))}
          </select>
        </label>

        {data.isPending ? (
          <LoadingState />
        ) : data.isError ? (
          <ErrorState onRetry={() => void data.refetch()} />
        ) : (
          <CodSummary data={data.data} current={month === months[0]} />
        )}
      </PageBody>
    </>
  )
}

function CodSummary({ data: d, current }: { data: CodMonth; current: boolean }) {
  const { t, locale } = useI18n()
  const c = t.codOrders
  // The month's last day (the commission is due when it ends).
  const lastDay = formatDate(new Date(new Date(d.to).getTime() - 1).toISOString(), locale)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-sm text-muted-foreground">{c.sales}</p>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(d.sales, locale)}</p>
            <p className="text-xs text-muted-foreground">{fill(c.salesHint, { n: d.orders })}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 py-4">
          <CardContent className="px-4">
            <p className="text-sm text-muted-foreground">{c.commission}</p>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(d.commission, locale)}</p>
            <p className="text-xs text-muted-foreground">{fill(c.rate, { rate: d.rate })}</p>
          </CardContent>
        </Card>
        <Card className="gap-1 border-primary/30 bg-brand-soft/60 py-4">
          <CardContent className="px-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-primary">
              <HandCoins className="size-4" />
              {d.toTransfer >= 0 ? c.toTransfer : c.weOwe}
            </p>
            <p className="text-2xl font-bold tabular-nums text-primary">{formatMoney(Math.abs(d.toTransfer), locale)}</p>
            {d.credit > 0 && <p className="text-xs text-muted-foreground">{fill(c.credit, { amount: formatMoney(d.credit, locale) })}</p>}
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <CalendarClock className="size-3.5" />
              {d.toTransfer >= 0 ? fill(current ? c.dueEnd : c.dueBy, { date: lastDay }) : c.weOweHint}
            </p>
          </CardContent>
        </Card>
      </div>

      {d.inProgress.orders > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          <Truck className="size-4 shrink-0" />
          {fill(c.inProgress, { n: d.inProgress.orders, amount: formatMoney(d.inProgress.sales, locale) })}
        </p>
      )}

      {d.account && d.toTransfer > 0 && <PayTo account={d.account} />}

      <Card className="gap-3">
        <CardHeader>
          <CardTitle className="text-base">{c.orders}</CardTitle>
        </CardHeader>
        <CardContent>
          {d.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{c.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{c.order}</TableHead>
                  <TableHead className="max-sm:hidden">{c.customer}</TableHead>
                  <TableHead className="max-sm:hidden">{c.completed}</TableHead>
                  <TableHead className="text-right">{c.orderSales}</TableHead>
                  <TableHead className="text-right">{c.orderCommission}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.items.map((i) => (
                  <TableRow key={i.number}>
                    <TableCell>
                      <Link to={`/orders/${i.number}`} className="font-mono text-xs font-medium hover:underline">
                        {i.number}
                      </Link>
                    </TableCell>
                    <TableCell className="max-sm:hidden">{i.customer}</TableCell>
                    <TableCell className="text-muted-foreground max-sm:hidden">{formatDate(i.completedAt, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(i.sales, locale)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(i.commission, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={1} className="font-semibold">
                    {c.total}
                  </TableCell>
                  <TableCell className="max-sm:hidden" colSpan={2} />
                  <TableCell className="text-right font-semibold tabular-nums">{formatMoney(d.sales, locale)}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatMoney(d.commission, locale)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Taladonline's account (and QR) for the commission transfer. */
function PayTo({ account }: { account: NonNullable<CodMonth['account']> }) {
  const { t } = useI18n()
  const c = t.codOrders
  const bank = account.bankCode && account.bankCode in LAO_BANKS ? LAO_BANKS[account.bankCode as BankCode] : account.bankCode
  const qr = useQuery({
    queryKey: ['shop', 'cod', 'qr'],
    enabled: account.hasQr,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/me/shop/cod/payment-qr`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
      if (!res.ok) throw new Error(String(res.status))
      return URL.createObjectURL(await res.blob())
    },
  })
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{c.payTo}</CardTitle>
        <CardDescription>{c.note}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {account.hasQr && (
          <span className="flex size-40 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-border">
            {qr.isPending ? <LoaderCircle className="size-6 animate-spin text-muted-foreground" /> : qr.data ? <img src={qr.data} alt="" className="size-full object-contain" /> : <ImageOff className="size-6 text-muted-foreground" />}
          </span>
        )}
        {account.accountNumber && (
          <div className="text-sm">
            {bank && <p className="text-muted-foreground">{bank}</p>}
            <p className="font-semibold">{account.accountName}</p>
            <p className="font-mono text-base tracking-wide">{account.accountNumber}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

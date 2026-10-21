import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { FilterTabs } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api } from '@/lib/api'
import { formatMoney, formatNumber } from '@/lib/format'
import { downloadFile } from '@/lib/private-file'
import type { TopRow } from '@/lib/types'

const PERIODS = ['thisMonth', 'lastMonth', 'last90', 'thisYear'] as const
type Period = (typeof PERIODS)[number]
const GROUPS = ['shop', 'category', 'product'] as const
type Group = (typeof GROUPS)[number]

interface Finance {
  gmv: number
  orders: number
  completedSales: number
  commissionCollected: number
  platformCoupons: number
  refundsIssued: { count: number; amount: number }
  payoutsPaid: { count: number; amount: number }
}
interface Customers {
  signups: number
  buyers: number
  firstTimeBuyers: number
  repeatBuyers: number
  repeatRate: number
}

/** `from`/`to` for a named period, read from the clock outside render. */
function range(p: Period): { from: string; to: string } {
  // Rounded up to the minute so the query key stays stable between renders.
  const now = new Date(Math.ceil(Date.now() / 60_000) * 60_000)
  const y = now.getFullYear()
  const m = now.getMonth()
  const from =
    p === 'thisMonth' ? new Date(y, m, 1) : p === 'lastMonth' ? new Date(y, m - 1, 1) : p === 'last90' ? new Date(now.getTime() - 90 * 86_400_000) : new Date(y, 0, 1)
  const to = p === 'lastMonth' ? new Date(y, m, 1) : now
  return { from: from.toISOString(), to: to.toISOString() }
}

/** Sales, money and customer reports for a period (§2.9). `?period=&group=` */
export function ReportsPage() {
  const { t, locale } = useI18n()
  const { params, set } = useUrlParams()
  const period = (PERIODS as readonly string[]).includes(params.get('period') ?? '') ? (params.get('period') as Period) : 'thisMonth'
  const group = (GROUPS as readonly string[]).includes(params.get('group') ?? '') ? (params.get('group') as Group) : 'shop'
  const { from, to } = range(period)
  const qs = new URLSearchParams({ from, to })
  const key = [from, to]
  const sales = useQuery({
    queryKey: ['admin', 'reports', 'sales', ...key, group],
    queryFn: () => api<{ rows: TopRow[] }>(`/admin/reports/sales?${qs}&group=${group}`),
    placeholderData: keepPreviousData,
  })
  const finance = useQuery({ queryKey: ['admin', 'reports', 'finance', ...key], queryFn: () => api<Finance>(`/admin/reports/finance?${qs}`) })
  const customers = useQuery({ queryKey: ['admin', 'reports', 'customers', ...key], queryFn: () => api<Customers>(`/admin/reports/customers?${qs}`) })
  const money = (n: number) => formatMoney(n, locale)
  const num = (n: number) => formatNumber(n, locale)

  return (
    <>
      <TopBar title={t.reports.title} />
      <PageBody>
        <PageIntro title={t.reports.title} description={t.reports.description} />
        <FilterTabs tabs={PERIODS.map((p) => ({ key: p, label: t.reports[p] }))} active={period} onSelect={(p) => set({ period: p === 'thisMonth' ? undefined : p })} />

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t.reports.finance}</CardTitle>
            </CardHeader>
            <CardContent>
              {finance.isPending ? (
                <LoadingState />
              ) : finance.isError ? (
                <ErrorState onRetry={() => void finance.refetch()} />
              ) : (
                <Stats
                  rows={[
                    [t.reports.gmv, `${money(finance.data.gmv)} · ${num(finance.data.orders)} ${t.reports.orders.toLowerCase()}`],
                    [t.reports.completedSales, money(finance.data.completedSales)],
                    [t.reports.commissionCollected, money(finance.data.commissionCollected)],
                    [t.reports.platformCoupons, `−${money(finance.data.platformCoupons)}`],
                    [t.reports.refundsIssued, `${money(finance.data.refundsIssued.amount)} (${num(finance.data.refundsIssued.count)})`],
                    [t.reports.payoutsPaid, `${money(finance.data.payoutsPaid.amount)} (${num(finance.data.payoutsPaid.count)})`],
                  ]}
                />
              )}
            </CardContent>
          </Card>
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t.reports.customers}</CardTitle>
            </CardHeader>
            <CardContent>
              {customers.isPending ? (
                <LoadingState />
              ) : customers.isError ? (
                <ErrorState onRetry={() => void customers.refetch()} />
              ) : (
                <Stats
                  rows={[
                    [t.reports.signups, num(customers.data.signups)],
                    [t.reports.buyers, num(customers.data.buyers)],
                    [t.reports.firstTime, num(customers.data.firstTimeBuyers)],
                    [t.reports.repeat, num(customers.data.repeatBuyers)],
                    [t.reports.repeatRate, `${customers.data.repeatRate}%`],
                  ]}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="gap-3">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">{t.reports.sales}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <FilterTabs tabs={GROUPS.map((g) => ({ key: g, label: t.reports.by[g] }))} active={group} onSelect={(g) => set({ group: g === 'shop' ? undefined : g })} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadFile(`/admin/reports/sales.csv?${qs}&group=${group}`, `sales-${group}-${from.slice(0, 10)}.csv`).catch(() => toast.error(t.common.loadError))}
              >
                <Download />
                {t.common.download}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            {sales.isPending ? (
              <LoadingState />
            ) : sales.isError ? (
              <ErrorState onRetry={() => void sales.refetch()} />
            ) : sales.data.rows.length === 0 ? (
              <p className="px-6 text-sm text-muted-foreground">{t.reports.noData}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">{t.reports.name}</TableHead>
                      <TableHead className="text-right">{t.reports.orders}</TableHead>
                      <TableHead className="text-right">{t.reports.units}</TableHead>
                      <TableHead className="text-right">{t.reports.revenue}</TableHead>
                      <TableHead className="pr-6 text-right">{t.reports.commission}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.data.rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="pl-6 font-medium">{r.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(r.orders)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(r.units)}</TableCell>
                        <TableCell className="text-right tabular-nums">{money(r.revenue)}</TableCell>
                        <TableCell className="pr-6 text-right tabular-nums">{money(r.commission)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}

function Stats({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="flex flex-col divide-y text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 py-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

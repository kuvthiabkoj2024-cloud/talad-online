import { LAO_BANKS, type BankCode } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gavel, LoaderCircle, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ALERTS_KEY } from '@/nav'
import { DisputeStatusBadge, OrderStatusBadge, PayoutStatusBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { FilterTabs, Pager } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber } from '@/lib/format'
import type { DisputeRow, DisputeStatus, Paged, PayoutList, PayoutStatus } from '@/lib/types'

const DISPUTE_STATUSES: DisputeStatus[] = ['OPEN', 'IN_REVIEW', 'RESOLVED_REFUND', 'RESOLVED_REJECTED']
type DisputeDecision = 'review' | 'refund' | 'reject'

/** Escalated returns: refund the customer or close the return (§2.10). */
export function DisputesPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { params, set, page } = useUrlParams()
  const status = DISPUTE_STATUSES.includes(params.get('status') as DisputeStatus) ? (params.get('status') as DisputeStatus) : undefined
  const query = new URLSearchParams({ page: String(page) })
  if (status) query.set('status', status)
  const list = useQuery({
    queryKey: ['admin', 'disputes', { status, page }],
    queryFn: () => api<Paged<DisputeRow> & { counts: Partial<Record<DisputeStatus, number>> }>(`/admin/disputes?${query}`),
    placeholderData: keepPreviousData,
  })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  const decide = (d: DisputeRow, decision: DisputeDecision) =>
    setConfirm({
      title: `${t.disputes.actions[decision]} · ${d.order.number}`,
      description: t.disputes.confirm[decision],
      confirmLabel: t.disputes.actions[decision],
      destructive: decision === 'reject',
      reason: decision === 'review' ? undefined : { label: t.disputes.resolutionLabel, required: true },
      onConfirm: async ({ reason }) => {
        await send('POST', `/admin/disputes/${d.id}/${decision}`, { reason })
        void queryClient.invalidateQueries({ queryKey: ['admin', 'disputes'] })
        void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
        toast.success(t.disputes.done)
      },
    })

  return (
    <>
      <TopBar title={t.disputes.title} />
      <PageBody>
        <PageIntro title={t.disputes.title} description={t.disputes.description} />
        <FilterTabs
          tabs={[{ key: 'all', label: t.common.all }, ...DISPUTE_STATUSES.map((s) => ({ key: s, label: t.disputeStatus[s], count: list.data?.counts[s] }))]}
          active={status ?? 'all'}
          onSelect={(k) => set({ status: k === 'all' ? undefined : k, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Gavel} title={t.disputes.emptyTitle} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {list.data.items.map((d) => {
                const open = d.status === 'OPEN' || d.status === 'IN_REVIEW'
                return (
                  <li key={d.id}>
                    <Card className="gap-3 py-4">
                      <CardContent className="flex flex-col gap-3 px-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            <DisputeStatusBadge status={d.status} />
                            <Link to={`/orders/${d.order.number}`} className="font-mono font-medium hover:underline">
                              {d.order.number}
                            </Link>
                            <OrderStatusBadge status={d.order.status} />
                            <span className="text-muted-foreground">
                              {d.order.shop.name} → {d.order.customer.name} · {formatMoney(d.order.total, locale)}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {t.disputes.raisedBy[d.raisedBy]} · {formatDate(d.createdAt, locale, true)}
                          </span>
                        </div>
                        <p className="text-sm">{d.reason}</p>
                        {d.details && <p className="text-sm text-muted-foreground">{d.details}</p>}
                        {d.resolution && (
                          <p className="rounded-lg bg-muted px-3 py-2 text-sm">
                            <span className="block text-xs text-muted-foreground">{t.disputes.resolution}</span>
                            {d.resolution}
                          </p>
                        )}
                        {open && (
                          <div className="flex flex-wrap gap-2">
                            {d.status === 'OPEN' && (
                              <Button variant="outline" size="sm" onClick={() => decide(d, 'review')}>
                                {t.disputes.actions.review}
                              </Button>
                            )}
                            <Button size="sm" onClick={() => decide(d, 'refund')}>
                              {t.disputes.actions.refund}
                            </Button>
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => decide(d, 'reject')}>
                              {t.disputes.actions.reject}
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ul>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </PageBody>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

const PAYOUT_STATUSES: PayoutStatus[] = ['SCHEDULED', 'PROCESSING', 'PAID', 'FAILED']
type PayoutAction = 'processing' | 'paid' | 'failed'
const NEXT: Record<PayoutStatus, PayoutAction[]> = { SCHEDULED: ['processing', 'paid', 'failed'], PROCESSING: ['paid', 'failed'], PAID: [], FAILED: [] }

/** Settle completed orders with shops (§2.3). */
export function PayoutsPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { params, set, page } = useUrlParams()
  const status = PAYOUT_STATUSES.includes(params.get('status') as PayoutStatus) ? (params.get('status') as PayoutStatus) : undefined
  const query = new URLSearchParams({ page: String(page) })
  if (status) query.set('status', status)
  const list = useQuery({
    queryKey: ['admin', 'payouts', { status, page }],
    queryFn: () => api<PayoutList>(`/admin/payouts?${query}`),
    placeholderData: keepPreviousData,
  })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'payouts'] })
    void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
  }
  const generate = useMutation({
    mutationFn: () => send<{ created: number }>('POST', '/admin/payouts/generate'),
    onSuccess: (r) => {
      toast.success(r.created ? fill(t.payouts.generated, { n: r.created }) : t.payouts.nothingToGenerate)
      refresh()
    },
    onError: () => toast.error(t.common.saveError),
  })
  const act = (id: string, shop: string, action: PayoutAction) =>
    setConfirm({
      title: `${t.payouts.actions[action]} · ${shop}`,
      description: t.payouts.confirm[action],
      confirmLabel: t.payouts.actions[action],
      destructive: action === 'failed',
      field: action === 'paid' ? { label: t.payouts.reference, required: true } : action === 'failed' ? { label: t.common.reason } : undefined,
      errorText: (e) => (e instanceof ApiError && e.code === 'REFERENCE_REQUIRED' ? t.payouts.referenceRequired : t.common.saveError),
      onConfirm: async ({ field }) => {
        await send('POST', `/admin/payouts/${id}/${action}`, { reference: field })
        refresh()
        toast.success(t.payouts.done)
      },
    })
  const u = list.data?.unsettled

  return (
    <>
      <TopBar title={t.payouts.title} />
      <PageBody>
        <PageIntro title={t.payouts.title} description={t.payouts.description} />
        {u && (
          <Card className="py-4">
            <CardContent className="flex flex-wrap items-center gap-4 px-4">
              <span className="flex size-10 items-center justify-center rounded-lg bg-brand-soft text-primary">
                <Wallet className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{t.payouts.unsettled}</span>
                <span className="block text-sm text-muted-foreground">
                  {fill(t.payouts.unsettledBody, { orders: formatNumber(u.orders, locale), net: formatMoney(u.net, locale) })} — {t.payouts.generateBody}
                </span>
              </span>
              <Button disabled={u.orders === 0 || generate.isPending} onClick={() => generate.mutate()}>
                {generate.isPending && <LoaderCircle className="animate-spin" />}
                {t.payouts.generate}
              </Button>
            </CardContent>
          </Card>
        )}
        <FilterTabs
          tabs={[{ key: 'all', label: t.common.all }, ...PAYOUT_STATUSES.map((s) => ({ key: s, label: t.payoutStatus[s], count: list.data?.totals[s]?.count }))]}
          active={status ?? 'all'}
          onSelect={(k) => set({ status: k === 'all' ? undefined : k, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Wallet} title={t.payouts.emptyTitle} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t.payouts.shop}</TableHead>
                    <TableHead>{t.payouts.period}</TableHead>
                    <TableHead className="text-right">{t.payouts.gross}</TableHead>
                    <TableHead className="text-right">{t.payouts.commission}</TableHead>
                    <TableHead className="text-right">{t.payouts.net}</TableHead>
                    <TableHead>{t.payouts.bank}</TableHead>
                    <TableHead>{t.common.status}</TableHead>
                    <TableHead className="pr-4" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-4">
                        <Link to={`/shops/${p.shop.id}`} className="font-medium hover:underline">
                          {p.shop.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {formatNumber(p.orderCount, locale)} {t.payouts.orders}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(p.periodStart, locale)} – {formatDate(p.periodEnd, locale)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(p.gross, locale)}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">−{formatMoney(p.commission, locale)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{formatMoney(p.net, locale)}</TableCell>
                      <TableCell className="text-sm">
                        {p.shop.paymentAccountNumber ? (
                          <>
                            <span className="block">{LAO_BANKS[p.shop.paymentBankCode as BankCode] ?? p.shop.paymentBankCode}</span>
                            <span className="block font-mono text-xs text-muted-foreground">
                              {p.shop.paymentAccountName} · {p.shop.paymentAccountNumber}
                            </span>
                          </>
                        ) : (
                          <span className="text-destructive">{t.payouts.noBank}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <PayoutStatusBadge status={p.status} />
                        {p.reference && <span className="mt-0.5 block font-mono text-xs text-muted-foreground">{p.reference}</span>}
                      </TableCell>
                      <TableCell className="pr-4">
                        <span className="flex justify-end gap-1">
                          {NEXT[p.status].map((a) => (
                            <Button key={a} size="sm" variant={a === 'paid' ? 'default' : 'outline'} className={a === 'failed' ? 'text-destructive hover:text-destructive' : ''} onClick={() => act(p.id, p.shop.name, a)}>
                              {t.payouts.actions[a]}
                            </Button>
                          ))}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </PageBody>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

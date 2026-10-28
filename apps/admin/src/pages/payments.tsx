import { LAO_BANKS, type BankCode } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, ChevronRight, ImageOff, Landmark, LoaderCircle, QrCode, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { OrderStatusBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { FilterTabs, Pager } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatDate, formatMoney } from '@/lib/format'
import { usePrivateImage } from '@/lib/private-file'
import type { PaymentAccount, PaymentQueue, PaymentQueuePage, PaymentReview, Paged, RefundQueue, RefundRow, SlipStatus } from '@/lib/types'
import { ALERTS_KEY } from '@/nav'

const QUEUES: PaymentQueue[] = ['review', 'rejected', 'approved']
const KEY = ['admin', 'payments'] as const

const SLIP_TONE: Record<SlipStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200',
}

/**
 * Transfers to check: customers pay Taladonline and send slips; approving sends the order to
 * its shops as paid, rejecting asks the customer for new slips.
 */
export function PaymentsPage() {
  const { t, locale } = useI18n()
  const { params, set, page } = useUrlParams()
  const queue = QUEUES.includes(params.get('status') as PaymentQueue) ? (params.get('status') as PaymentQueue) : 'review'
  const list = useQuery({
    queryKey: [...KEY, { queue, page }],
    queryFn: () => api<PaymentQueuePage>(`/admin/payments?status=${queue}&page=${page}`),
    placeholderData: keepPreviousData,
  })
  const account = useQuery({ queryKey: ['admin', 'payment-account'], queryFn: () => api<PaymentAccount>('/admin/settings/payment-account'), retry: false })
  const noAccount = account.data && !account.data.hasQr && !account.data.accountNumber

  return (
    <>
      <TopBar title={t.payments.title} />
      <PageBody>
        <PageIntro title={t.payments.title} description={t.payments.description} />
        {noAccount && (
          <Link to="/settings" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:underline dark:bg-amber-950/40 dark:text-amber-100">
            {t.payments.noAccount}
          </Link>
        )}
        <FilterTabs
          tabs={QUEUES.map((q) => ({ key: q, label: t.payments.queues[q], count: list.data?.counts[q] }))}
          active={queue}
          onSelect={(k) => set({ status: k === 'review' ? undefined : k, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Landmark} title={t.payments.emptyTitle} body={queue === 'review' ? t.payments.emptyReview : undefined} />
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {list.data.items.map((p) => (
                <li key={p.number}>
                  <Link to={`/payments/${p.number}`} className="flex items-center gap-4 rounded-xl bg-card px-4 py-3 shadow-sm ring-1 ring-border transition hover:shadow-md">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">{p.number}</span>
                        <span className="text-sm text-muted-foreground">{p.customer.name}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {p.shopOrders.map((s) => s.shop).join(' · ')} · {fill(t.payments.slipCount, { n: p.slips.length })}
                        {p.lastSlipAt && ` · ${fill(t.payments.sentAt, { date: formatDate(p.lastSlipAt, locale, true) })}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-base font-bold tabular-nums">{formatMoney(p.total, locale)}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </PageBody>
    </>
  )
}

/** One checkout's transfer: its slips beside the amount and shops, then approve or reject. */
export function PaymentDetailPage() {
  const { number = '' } = useParams()
  const { t, locale } = useI18n()
  const detail = useQuery({ queryKey: [...KEY, 'detail', number], queryFn: () => api<PaymentReview>(`/admin/payments/${encodeURIComponent(number)}`) })

  return (
    <>
      <TopBar title={number} backTo="/payments" />
      <PageBody>
        <Link to="/payments" className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground max-md:hidden">
          <ArrowLeft className="size-4" />
          {t.payments.back}
        </Link>
        {detail.isPending ? (
          <LoadingState />
        ) : detail.isError ? (
          <ErrorState onRetry={() => void detail.refetch()} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <PaymentCheckPanel number={number} />
            <Card className="gap-2 self-start">
              <CardContent className="flex flex-col gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">{t.payments.amount}</p>
                  <p className="text-2xl font-bold tabular-nums text-primary">{formatMoney(detail.data.total, locale)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.payments.customer}</p>
                  <Link to={`/customers/${detail.data.customer.id}`} className="font-medium hover:underline">
                    {detail.data.customer.name}
                  </Link>
                  {detail.data.customer.phone && <p className="text-muted-foreground">{detail.data.customer.phone}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">{t.payments.shops}</p>
                  {detail.data.shopOrders.map((so) => (
                    <Link key={so.number} to={`/orders/${so.number}`} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 hover:bg-muted">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{so.shop}</span>
                        <span className="font-mono text-xs text-muted-foreground">{so.number}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <OrderStatusBadge status={so.status} />
                        <span className="text-xs tabular-nums">{formatMoney(so.total, locale)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
                {detail.data.shopOrders[0]?.paymentDueAt && detail.data.shopOrders.some((so) => so.status === 'PENDING') && (
                  <p className="text-xs text-muted-foreground">{fill(t.payments.payBy, { date: formatDate(detail.data.shopOrders[0].paymentDueAt, locale, true) })}</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </PageBody>
    </>
  )
}

/**
 * A checkout's slips with their verdicts, and — while some wait — Approve / Reject. Used on the
 * Payments page and on a waiting order in Orders.
 */
export function PaymentCheckPanel({ number, title, hint }: { number: string; title?: string; hint?: string }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const key = [...KEY, 'detail', number]
  const detail = useQuery({ queryKey: key, queryFn: () => api<PaymentReview>(`/admin/payments/${encodeURIComponent(number)}`) })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

  const done = (saved: PaymentReview, message: string) => {
    queryClient.setQueryData(key, saved)
    void queryClient.invalidateQueries({ queryKey: KEY })
    void queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] })
    void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
    toast.success(message)
  }
  const approve = () =>
    setConfirm({
      title: fill(t.payments.approveTitle, { number }),
      description: t.payments.approveBody,
      confirmLabel: t.payments.approve,
      onConfirm: async () => done(await send<PaymentReview>('POST', `/admin/payments/${encodeURIComponent(number)}/approve`), t.payments.approved),
    })
  const reject = () =>
    setConfirm({
      title: fill(t.payments.rejectTitle, { number }),
      description: t.payments.rejectBody,
      confirmLabel: t.payments.reject,
      destructive: true,
      reason: { label: t.payments.rejectReason, required: true },
      onConfirm: async ({ reason }) => done(await send<PaymentReview>('POST', `/admin/payments/${encodeURIComponent(number)}/reject`, { reason }), t.payments.rejected),
    })

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title ?? t.payments.slips}</CardTitle>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {detail.isPending ? (
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        ) : detail.isError ? (
          <ErrorState onRetry={() => void detail.refetch()} />
        ) : (
          <>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
              {detail.data.slips.map((sl) => (
                <li key={sl.id} className="flex flex-col gap-1.5">
                  <button type="button" onClick={() => setViewing(sl.id)} className="overflow-hidden rounded-lg bg-muted ring-1 ring-border transition hover:ring-primary">
                    <SlipImage id={sl.id} className="aspect-[3/4] w-full object-cover" />
                  </button>
                  <span className={cn('self-start rounded-full px-2 py-0.5 text-xs font-semibold', SLIP_TONE[sl.status])}>{t.payments.slipStatus[sl.status]}</span>
                  <span className="text-xs text-muted-foreground">{fill(t.payments.sentAt, { date: formatDate(sl.createdAt, locale, true) })}</span>
                  {sl.rejectReason && <span className="text-xs text-destructive">{fill(t.payments.rejectedBecause, { reason: sl.rejectReason })}</span>}
                </li>
              ))}
            </ul>
            {detail.data.pending > 0 && (
              <div className="flex gap-2 max-lg:sticky max-lg:bottom-3">
                <Button className="flex-1 sm:flex-none" onClick={approve}>
                  <Check />
                  {t.payments.approve}
                </Button>
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={reject}>
                  <X />
                  {t.payments.reject}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.payments.slips}</DialogTitle>
          </DialogHeader>
          {viewing && <SlipImage id={viewing} className="max-h-[75vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SlipImage({ id, className }: { id: string; className?: string }) {
  return <PrivateImage path={`/admin/payments/slips/${id}`} className={className} />
}

function PrivateImage({ path, className }: { path: string; className?: string }) {
  const img = usePrivateImage(path)
  if (img.isPending) return <span className={cn('flex items-center justify-center', className)}><LoaderCircle className="size-5 animate-spin text-muted-foreground" /></span>
  if (!img.data) return <span className={cn('flex items-center justify-center', className)}><ImageOff className="size-6 text-muted-foreground" /></span>
  return <img src={img.data} alt="" className={cn('bg-white', className)} />
}

const REFUND_QUEUES: RefundQueue[] = ['due', 'done']

/** Paid orders that were cancelled: send the money back to the customer, then mark it done. */
export function RefundsPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { params, set, page } = useUrlParams()
  const queue = REFUND_QUEUES.includes(params.get('status') as RefundQueue) ? (params.get('status') as RefundQueue) : 'due'
  const list = useQuery({
    queryKey: ['admin', 'refunds', { queue, page }],
    queryFn: () => api<Paged<RefundRow> & { counts: { due: number } }>(`/admin/refunds?status=${queue}&page=${page}`),
    placeholderData: keepPreviousData,
  })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const [qr, setQr] = useState<string | null>(null)

  const markDone = (r: RefundRow) =>
    setConfirm({
      title: fill(t.refunds.doneTitle, { number: r.number }),
      description: fill(t.refunds.doneBody, { amount: formatMoney(r.amount, locale) }),
      confirmLabel: t.refunds.markDone,
      field: { label: t.refunds.reference },
      onConfirm: async ({ field }) => {
        await send('POST', `/admin/refunds/${encodeURIComponent(r.number)}/done`, { reference: field })
        void queryClient.invalidateQueries({ queryKey: ['admin', 'refunds'] })
        void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
        toast.success(t.refunds.done)
      },
    })

  return (
    <>
      <TopBar title={t.refunds.title} />
      <PageBody>
        <PageIntro title={t.refunds.title} description={t.refunds.description} />
        <FilterTabs
          tabs={REFUND_QUEUES.map((q) => ({ key: q, label: t.refunds.queues[q], count: q === 'due' ? list.data?.counts.due : undefined }))}
          active={queue}
          onSelect={(k) => set({ status: k === 'due' ? undefined : k, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Undo2} title={t.refunds.emptyTitle} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {list.data.items.map((r) => {
                const a = r.refundAccount
                const bank = a && (a.bankCode in LAO_BANKS ? LAO_BANKS[a.bankCode as BankCode] : a.bankCode)
                return (
                  <li key={r.number}>
                    <Card className="gap-3 py-4">
                      <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-start">
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="flex flex-wrap items-center gap-2">
                            <Link to={`/orders/${r.number}`} className="font-mono font-semibold hover:underline">
                              {r.number}
                            </Link>
                            <span className="text-muted-foreground">
                              {r.shop} →{' '}
                              <Link to={`/customers/${r.customer.id}`} className="hover:underline">
                                {r.customer.name}
                              </Link>
                            </span>
                          </p>
                          {r.reason && (
                            <p className="mt-1 text-muted-foreground">
                              {t.refunds.reason}: {r.reason}
                            </p>
                          )}
                          <div className="mt-2 rounded-lg bg-muted/60 px-3 py-2">
                            <p className="text-xs text-muted-foreground">{t.refunds.refundTo}</p>
                            {a ? (
                              <>
                                <p className="font-medium">{a.accountName}</p>
                                <p className="font-mono">{a.accountNumber} · {bank}</p>
                              </>
                            ) : (
                              <p className="text-amber-700 dark:text-amber-300">{fill(t.refunds.noAccount, { phone: r.customer.phone ?? '—' })}</p>
                            )}
                          </div>
                          {r.refundedAt && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {fill(t.refunds.refundedOn, { date: formatDate(r.refundedAt, locale, true) })}
                              {r.reference && ` · ${r.reference}`}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                          <span className="text-lg font-bold tabular-nums">{formatMoney(r.amount, locale)}</span>
                          {a?.hasQr && (
                            <Button variant="outline" size="sm" onClick={() => setQr(a.id)}>
                              <QrCode />
                              {t.refunds.showQr}
                            </Button>
                          )}
                          {!r.refundedAt && (
                            <Button size="sm" onClick={() => markDone(r)}>
                              <Check />
                              {t.refunds.markDone}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                )
              })}
            </ul>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </PageBody>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
      <Dialog open={qr !== null} onOpenChange={(open) => !open && setQr(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.refunds.refundTo}</DialogTitle>
          </DialogHeader>
          {qr && <PrivateImage path={`/admin/refunds/accounts/${qr}/qr`} className="aspect-square w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  )
}

import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, HandCoins, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { FilterTabs, Pager } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { PrivateImage } from '@/components/private-image'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatDate, formatMoney } from '@/lib/format'
import type { Paged } from '@/lib/types'
import { ALERTS_KEY } from '@/nav'

type Status = 'SUBMITTED' | 'CONFIRMED' | 'REJECTED'
const STATUSES: Status[] = ['SUBMITTED', 'CONFIRMED', 'REJECTED']

interface CodTransferRow {
  id: string
  month: string
  amount: number
  note: string | null
  status: Status
  rejectReason: string | null
  createdAt: string
  reviewedAt: string | null
  shop: { id: string; name: string; slug: string }
  /** The commission the shop owed for that month. */
  due: number
}

/** Shops' COD commission transfers: check each slip against MC Mart's account, then confirm or reject. */
export function CodTransfersPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { params, set, page } = useUrlParams()
  const status = STATUSES.includes(params.get('status') as Status) ? (params.get('status') as Status) : 'SUBMITTED'
  const list = useQuery({
    queryKey: ['admin', 'cod-transfers', { status, page }],
    queryFn: () => api<Paged<CodTransferRow> & { counts: { submitted: number } }>(`/admin/cod-transfers?status=${status}&page=${page}`),
    placeholderData: keepPreviousData,
  })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const [slip, setSlip] = useState<string | null>(null)
  const c = t.codTransfers

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'cod-transfers'] })
    void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
  }
  const decide = (r: CodTransferRow, decision: 'confirm' | 'reject') =>
    setConfirm(
      decision === 'confirm'
        ? {
            title: fill(c.confirmTitle, { amount: formatMoney(r.amount, locale), shop: r.shop.name }),
            description: c.confirmBody,
            confirmLabel: c.confirm,
            onConfirm: async () => {
              await send('POST', `/admin/cod-transfers/${r.id}/confirm`, {})
              refresh()
              toast.success(c.confirmed)
            },
          }
        : {
            title: c.rejectTitle,
            description: c.rejectBody,
            confirmLabel: c.reject,
            destructive: true,
            reason: { label: c.reason, required: true },
            onConfirm: async ({ reason }) => {
              await send('POST', `/admin/cod-transfers/${r.id}/reject`, { reason })
              refresh()
              toast.success(c.rejected)
            },
          },
    )

  return (
    <>
      <TopBar title={c.title} />
      <PageBody>
        <PageIntro title={c.title} description={c.description} />
        <FilterTabs
          tabs={STATUSES.map((s) => ({ key: s, label: c.queues[s], count: s === 'SUBMITTED' ? list.data?.counts.submitted : undefined }))}
          active={status}
          onSelect={(k) => set({ status: k === 'SUBMITTED' ? undefined : k, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={HandCoins} title={c.emptyTitle} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <Card className="gap-3 py-4">
                    <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-start">
                      <button type="button" onClick={() => setSlip(r.id)} className="shrink-0 self-start overflow-hidden rounded-lg ring-1 ring-border hover:ring-primary">
                        <PrivateImage path={`/admin/cod-transfers/${r.id}/slip`} className="h-28 w-24 object-cover" />
                      </button>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="flex flex-wrap items-center gap-x-2">
                          <Link to={`/shops/${r.shop.id}`} className="font-semibold hover:underline">
                            {r.shop.name}
                          </Link>
                          <span className="text-muted-foreground">{fill(c.month, { month: r.month })}</span>
                        </p>
                        <p className="mt-1 text-muted-foreground">{fill(c.due, { amount: formatMoney(r.due, locale) })}</p>
                        {r.note && (
                          <p className="mt-1">
                            {c.note}: {r.note}
                          </p>
                        )}
                        {r.rejectReason && <p className="mt-1 text-destructive">{fill(c.rejectedBecause, { reason: r.rejectReason })}</p>}
                        <p className="mt-1 text-xs text-muted-foreground">{fill(c.sent, { date: formatDate(r.createdAt, locale, true) })}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                        <span className="text-lg font-bold tabular-nums">{formatMoney(r.amount, locale)}</span>
                        {r.status === 'SUBMITTED' && (
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => decide(r, 'reject')}>
                              <X />
                              {c.reject}
                            </Button>
                            <Button size="sm" onClick={() => decide(r, 'confirm')}>
                              <Check />
                              {c.confirm}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(n) => set({ page: String(n) })} />
          </>
        )}
      </PageBody>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
      <Dialog open={slip !== null} onOpenChange={(open) => !open && setSlip(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.payouts.slip}</DialogTitle>
          </DialogHeader>
          {slip && <PrivateImage path={`/admin/cod-transfers/${slip}/slip`} className="max-h-[70svh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  )
}

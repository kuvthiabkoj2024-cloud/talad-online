import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BadgePercent, Check, ImageOff, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { FilterTabs, Pager } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { commissionLabel } from '@/lib/commission'
import { fill, formatDate, formatMoney, localized } from '@/lib/format'
import type { CommissionRequestPage, CommissionRequestRow, CommissionRequestStatus } from '@/lib/types'
import { ALERTS_KEY } from '@/nav'

const STATUSES: CommissionRequestStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']
const KEY = ['admin', 'commission-requests'] as const

/**
 * Shops ask for their own commission on a product (a percent, or a fixed amount per unit for
 * high-cost goods). Approved, the product pays only that, ahead of its category and shop,
 * until an admin removes it.
 */
export function CommissionsPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const { params, set, page } = useUrlParams()
  const status = STATUSES.includes(params.get('status') as CommissionRequestStatus) ? (params.get('status') as CommissionRequestStatus) : 'PENDING'
  const list = useQuery({
    queryKey: [...KEY, { status, page }],
    queryFn: () => api<CommissionRequestPage>(`/admin/commission-requests?status=${status}&page=${page}`),
    placeholderData: keepPreviousData,
  })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const label = (c: Parameters<typeof commissionLabel>[0]) => commissionLabel(c, locale, t.commission.perUnit)
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: KEY })
    void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
  }

  const decide = (r: CommissionRequestRow, decision: 'approve' | 'reject') =>
    setConfirm({
      title: decision === 'approve' ? t.commission.approveTitle : t.commission.rejectTitle,
      description: fill(decision === 'approve' ? t.commission.approveBody : t.commission.rejectBody, {
        product: r.product.name,
        rate: label(r.requested),
      }),
      confirmLabel: decision === 'approve' ? t.commission.approve : t.commission.reject,
      destructive: decision === 'reject',
      reason: { label: decision === 'approve' ? t.commission.noteOptional : t.commission.reason, required: decision === 'reject' },
      onConfirm: async ({ reason }) => {
        await send('POST', `/admin/commission-requests/${r.id}/${decision}`, { note: reason || undefined })
        refresh()
        toast.success(decision === 'approve' ? t.commission.approved : t.commission.rejected)
      },
    })

  const remove = (r: CommissionRequestRow) =>
    setConfirm({
      title: t.commission.removeTitle,
      description: fill(t.commission.removeBody, { product: r.product.name, rate: label(r.standard.commission) }),
      confirmLabel: t.commission.remove,
      destructive: true,
      onConfirm: async () => {
        await send('PUT', `/admin/products/${r.product.id}/commission`, { commission: null })
        refresh()
        toast.success(t.commission.removed)
      },
    })

  return (
    <>
      <TopBar title={t.commission.title} />
      <PageBody>
        <PageIntro title={t.commission.title} description={t.commission.description} />
        <FilterTabs
          tabs={STATUSES.map((s) => ({ key: s, label: t.commission.statuses[s], count: s === 'PENDING' ? list.data?.counts.PENDING : undefined }))}
          active={status}
          onSelect={(k) => set({ status: k === 'PENDING' ? undefined : k, page: undefined })}
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={BadgePercent} title={t.commission.empty} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <Card className="py-4">
                    <CardContent className="flex flex-col gap-3 px-4 sm:flex-row sm:items-start">
                      <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                        {r.product.imageUrl ? <img src={r.product.imageUrl} alt="" className="size-full object-cover" /> : <ImageOff className="size-5 text-muted-foreground" />}
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <Link to={`/products/${r.product.id}`} className="font-semibold hover:underline">
                          {r.product.name}
                        </Link>
                        <p className="text-muted-foreground">
                          <Link to={`/shops/${r.shop.id}`} className="hover:underline">
                            {r.shop.name}
                          </Link>
                          {' · '}
                          {localized(r.product.category, locale)} · {formatMoney(r.product.price, locale)}
                        </p>
                        {/* Standard (category / shop / default) → what the shop asks for. */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-muted px-2 py-1">
                            <span className="text-xs text-muted-foreground">{t.commission.sources[r.standard.source]} </span>
                            <span className="font-medium tabular-nums">{label(r.standard.commission)}</span>
                          </span>
                          <ArrowRight className="size-4 text-muted-foreground" />
                          <span className="rounded-md bg-primary/10 px-2 py-1 font-semibold text-primary tabular-nums">{label(r.requested)}</span>
                        </div>
                        {r.reason && (
                          <p className="mt-2 text-muted-foreground">
                            {t.commission.shopReason}: {r.reason}
                          </p>
                        )}
                        {r.reviewNote && (
                          <p className="mt-1 text-muted-foreground">
                            {t.commission.note}: {r.reviewNote}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(r.createdAt, locale, true)}
                          {r.reviewedAt && ` · ${fill(t.commission.reviewedOn, { date: formatDate(r.reviewedAt, locale, true) })}`}
                          {r.status === 'APPROVED' && !r.productCommission && ` · ${t.commission.noLongerActive}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2 sm:flex-col sm:items-stretch">
                        {r.status === 'PENDING' && (
                          <>
                            <Button size="sm" onClick={() => decide(r, 'approve')}>
                              <Check />
                              {t.commission.approve}
                            </Button>
                            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => decide(r, 'reject')}>
                              <X />
                              {t.commission.reject}
                            </Button>
                          </>
                        )}
                        {r.status === 'APPROVED' && r.productCommission && (
                          <Button size="sm" variant="outline" onClick={() => remove(r)}>
                            <Undo2 />
                            {t.commission.remove}
                          </Button>
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
    </>
  )
}

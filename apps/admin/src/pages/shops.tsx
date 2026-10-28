import { formatPhone, LAO_BANKS, type BankCode } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Label } from '@talad/ui/components/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, FileText, ImageOff, LoaderCircle, Store } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { can, useAuth } from '@/auth/context'
import { ShopStatusBadge } from '@/components/badges'
import { CommissionInput } from '@/components/commission-input'
import { commissionFrom, commissionLabel, draftOf } from '@/lib/commission'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber, storefrontUrl } from '@/lib/format'
import { openPrivateFile, usePrivateImage } from '@/lib/private-file'
import type { Paged, ShopDetail, ShopRow, ShopStatus } from '@/lib/types'
import { ALERTS_KEY } from '@/nav'

const STATUSES: ShopStatus[] = ['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']
type Decision = 'approve' | 'reject' | 'suspend' | 'reinstate'
const DECISIONS: Record<ShopStatus, Decision[]> = {
  PENDING: ['approve', 'reject'],
  APPROVED: ['suspend'],
  REJECTED: ['approve'],
  SUSPENDED: ['reinstate'],
}

/** Shop list with the application queue (§2.3). `?status=PENDING&q=` */
export function ShopsPage() {
  const { t, locale } = useI18n()
  const { params, set, page } = useUrlParams()
  const status = STATUSES.includes(params.get('status') as ShopStatus) ? (params.get('status') as ShopStatus) : undefined
  const q = params.get('q') ?? ''
  const [search, setSearch] = useSearchParamInput(q, set)
  const query = new URLSearchParams({ page: String(page) })
  if (status) query.set('status', status)
  if (q) query.set('q', q)
  const list = useQuery({
    queryKey: ['admin', 'shops', { status, q, page }],
    queryFn: () => api<Paged<ShopRow> & { counts: Record<ShopStatus | 'all', number> }>(`/admin/shops?${query}`),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <TopBar title={t.shops.title} />
      <PageBody>
        <PageIntro title={t.shops.title} description={t.shops.description} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs
            tabs={[{ key: 'all', label: t.common.all, count: list.data?.counts.all }, ...STATUSES.map((s) => ({ key: s, label: t.shopStatus[s], count: list.data?.counts[s] }))]}
            active={status ?? 'all'}
            onSelect={(k) => set({ status: k === 'all' ? undefined : k, page: undefined })}
          />
          <SearchBox value={search} onChange={setSearch} placeholder={t.shops.searchPlaceholder} />
        </div>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Store} title={t.shops.emptyTitle} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t.nav.shops}</TableHead>
                    <TableHead>{t.shops.owner}</TableHead>
                    <TableHead>{t.products.title}</TableHead>
                    <TableHead>{t.shops.orders}</TableHead>
                    <TableHead>{t.shops.commission}</TableHead>
                    <TableHead>{t.products.updated}</TableHead>
                    <TableHead className="pr-4">{t.common.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="pl-4">
                        <Link to={`/shops/${s.id}`} className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
                            {s.logoUrl ? <img src={s.logoUrl} alt="" className="size-full object-cover" /> : <Store className="size-4" />}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:underline">{s.name}</span>
                            <span className="block text-xs text-muted-foreground">/{s.slug}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>{s.ownerName}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(s._count.products, locale)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(s._count.orders, locale)}</TableCell>
                      <TableCell className="tabular-nums">{s.commission ? commissionLabel(s.commission, locale, t.commission.perUnit) : <span className="text-muted-foreground">{t.shops.defaultRate}</span>}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(s.status === 'PENDING' ? s.updatedAt : s.createdAt, locale)}</TableCell>
                      <TableCell className="pr-4">
                        <ShopStatusBadge status={s.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </PageBody>
    </>
  )
}

/** One shop: application, KYC, standing and commission (§2.3). */
export function ShopDetailPage() {
  const { id = '' } = useParams()
  const { t, locale } = useI18n()
  const { admin } = useAuth()
  const queryClient = useQueryClient()
  const shop = useQuery({ queryKey: ['admin', 'shops', id], queryFn: () => api<ShopDetail>(`/admin/shops/${id}`) })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  if (shop.isPending) {
    return (
      <>
        <TopBar title={t.nav.shops} backTo="/shops" />
        <LoadingState />
      </>
    )
  }
  if (shop.isError) {
    return (
      <>
        <TopBar title={t.nav.shops} backTo="/shops" />
        <PageBody>
          <ErrorState onRetry={() => void shop.refetch()} />
        </PageBody>
      </>
    )
  }
  const s = shop.data
  const decide = (d: Decision) =>
    setConfirm({
      title: `${t.shops.actions[d]} · ${s.name}`,
      description: t.shops.confirm[d],
      confirmLabel: t.shops.actions[d],
      destructive: d === 'reject' || d === 'suspend',
      reason: d === 'reject' || d === 'suspend' ? { required: true } : undefined,
      errorText: (e) => errorText(e, t),
      onConfirm: async ({ reason }) => {
        const saved = await send<ShopDetail>('POST', `/admin/shops/${s.id}/${d}`, { reason })
        queryClient.setQueryData(['admin', 'shops', id], saved)
        void queryClient.invalidateQueries({ queryKey: ['admin', 'shops'] })
        void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
        toast.success(t.shops.done)
      },
    })

  return (
    <>
      <TopBar title={s.name} backTo="/shops" />
      <PageBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground">
              {s.logoUrl ? <img src={s.logoUrl} alt="" className="size-full object-cover" /> : <Store className="size-6" />}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">{s.name}</h2>
                <ShopStatusBadge status={s.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                /{s.slug} · {fill(t.shops.applied, { date: formatDate(s.createdAt, locale) })}
              </p>
              {s.rejectionReason && (s.status === 'REJECTED' || s.status === 'SUSPENDED') && (
                <p className="mt-1 text-sm text-destructive">{fill(t.shops.rejectionReason, { reason: s.rejectionReason })}</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.status === 'APPROVED' && (
              <Button asChild variant="outline">
                <a href={storefrontUrl.shop(locale, s.slug)} target="_blank" rel="noreferrer">
                  {t.common.openInStore}
                  <ExternalLink />
                </a>
              </Button>
            )}
            {can(admin, 'shops.review') &&
              DECISIONS[s.status].map((d) => (
                <Button key={d} variant={d === 'reject' || d === 'suspend' ? 'outline' : 'default'} className={d === 'reject' || d === 'suspend' ? 'text-destructive hover:text-destructive' : ''} onClick={() => decide(d)}>
                  {t.shops.actions[d]}
                </Button>
              ))}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t.shops.business}</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                <Info label={t.shops.owner} value={s.ownerName} />
                <Info label={t.shops.email} value={s.email} />
                <Info label={t.shops.phone} value={formatPhone(s.phone)} />
                <Info label={t.shops.address} value={s.address ?? t.shops.noAddress} />
                {s.description && <Info label={t.shops.about} value={s.description} wide />}
              </CardContent>
            </Card>

            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t.shops.documents}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {s.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t.shops.noDocuments}</p>
                ) : (
                  s.documents.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 rounded-lg border p-3">
                      <FileText className="size-5 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{t.shops.docTypes[d.type]}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(d.createdAt, locale, true)} · {d.ext?.toUpperCase()}
                          {d.reviewedAt && ` · ${fill(t.shops.reviewed, { date: formatDate(d.reviewedAt, locale) })}`}
                        </span>
                      </span>
                      <Button variant="outline" size="sm" onClick={() => void openPrivateFile(`/admin/shops/${s.id}/documents/${d.id}`)}>
                        {t.shops.viewDocument}
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="gap-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t.shops.performance}</CardTitle>
                <div className="flex gap-3 text-sm">
                  {can(admin, 'products') && (
                    <Link to={`/products?shopId=${s.id}`} className="text-primary hover:underline">
                      {t.shops.viewProducts}
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
                <Info label={t.shops.completedRevenue} value={formatMoney(s.completedRevenue, locale)} />
                <Info label={t.shops.commissionEarned} value={formatMoney(s.commissionEarned, locale)} />
                <Info label={t.shops.rating} value={s.ratingCount ? `${s.ratingAvg.toFixed(1)} ★ (${s.ratingCount})` : '—'} />
                <Info
                  label={t.products.title}
                  value={Object.entries(s.productCounts).map(([k, v]) => `${t.productStatus[k as keyof Dict['productStatus']]}: ${v}`).join(' · ') || '0'}
                  wide
                />
                <Info
                  label={t.shops.orders}
                  value={statusCounts(s.orderCounts, t).join(' · ') || '0'}
                  wide
                />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            {s.owner && (
              <Card className="gap-2">
                <CardHeader>
                  <CardTitle className="text-base">{t.shops.ownerAccount}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="font-medium">{s.owner.name}</p>
                  <p className="text-muted-foreground">{s.owner.phone ? formatPhone(s.owner.phone) : s.owner.email}</p>
                  {can(admin, 'customers') && (
                    <Link to={`/customers/${s.owner.id}`} className="mt-2 inline-block text-primary hover:underline">
                      {t.common.open}
                    </Link>
                  )}
                </CardContent>
              </Card>
            )}
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="text-base">{t.shops.paymentAccount}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {s.payment.accountNumber ? (
                  <>
                    <p className="font-medium">{LAO_BANKS[s.payment.bankCode as BankCode] ?? s.payment.bankCode}</p>
                    <p>{s.payment.accountName}</p>
                    <p className="font-mono text-muted-foreground">{s.payment.accountNumber}</p>
                  </>
                ) : (
                  <p className="text-muted-foreground">{t.shops.noPayment}</p>
                )}
                {s.payment.hasQr && <ShopQr shopId={s.id} label={t.shops.hasQr} />}
                <p className="mt-3 border-t pt-3 text-xs">
                  <span className="font-medium">{t.shops.cod}: </span>
                  {s.cod.enabled ? (
                    <span className="text-primary">
                      {fill(t.shops.codOn, { date: s.cod.termsAcceptedAt ? formatDate(s.cod.termsAcceptedAt, locale) : '—' })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{t.shops.codOff}</span>
                  )}
                </p>
              </CardContent>
            </Card>
            {can(admin, 'shops.commission') && (
              <CommissionCard shop={s} defaultRate={s.platformCommissionRate} onSaved={(saved) => queryClient.setQueryData(['admin', 'shops', id], saved)} />
            )}
          </div>
        </div>
      </PageBody>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function CommissionCard({ shop, defaultRate, onSaved }: { shop: ShopDetail; defaultRate?: number; onSaved: (s: ShopDetail) => void }) {
  const { t } = useI18n()
  const [commission, setCommission] = useState(draftOf(shop.commission))
  const save = useMutation({
    mutationFn: () => send<ShopDetail>('PUT', `/admin/shops/${shop.id}/commission`, { commission: commissionFrom(commission) }),
    onSuccess: (saved) => {
      onSaved(saved)
      toast.success(t.common.saved)
    },
    onError: () => toast.error(t.common.saveError),
  })
  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="text-base">{t.shops.commissionTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Label htmlFor="rate" className="sr-only">
            {t.shops.commissionTitle}
          </Label>
          <CommissionInput id="rate" value={commission} onChange={setCommission} placeholder={defaultRate !== undefined && commission.type === 'PERCENT' ? String(defaultRate) : ''} />
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <LoaderCircle className="animate-spin" />}
              {t.common.save}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{fill(t.shops.commissionHint, { rate: defaultRate ?? '—' })}</p>
        </form>
      </CardContent>
    </Card>
  )
}

function Info({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-full' : ''}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="break-words">{value}</p>
    </div>
  )
}

function errorText(e: unknown, t: Dict): string {
  if (e instanceof ApiError && e.code && e.code in t.shops.errors) return t.shops.errors[e.code as keyof Dict['shops']['errors']]
  return t.common.saveError
}

/** The shop's receiving QR (where payouts go): a thumbnail, full size in a pop-up. */
function ShopQr({ shopId, label }: { shopId: string; label: string }) {
  const [open, setOpen] = useState(false)
  const qr = usePrivateImage(`/admin/shops/${shopId}/payment-qr`)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!qr.data}
        className="mt-2 flex size-32 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-border transition hover:ring-primary"
        aria-label={label}
        title={label}
      >
        {qr.isPending ? (
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
        ) : qr.data ? (
          <img src={qr.data} alt="" className="size-full object-contain" />
        ) : (
          <ImageOff className="size-5 text-muted-foreground" />
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          {qr.data && <img src={qr.data} alt={label} className="w-full rounded-lg bg-white object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** "To ship: 12 · Sent: 2 …": statuses sharing a label (packed and confirmed are both "to ship") add up. */
function statusCounts(counts: Partial<Record<string, number>>, t: Dict): string[] {
  const byLabel = new Map<string, number>()
  for (const [status, n] of Object.entries(counts)) {
    const label = t.orderStatus[status as keyof Dict['orderStatus']] ?? status
    byLabel.set(label, (byLabel.get(label) ?? 0) + (n ?? 0))
  }
  return [...byLabel].map(([label, n]) => `${label}: ${n}`)
}

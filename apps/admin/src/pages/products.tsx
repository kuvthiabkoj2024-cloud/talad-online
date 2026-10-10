import { PRODUCT_STATUSES, type ProductStatus } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, ImageOff, Package, TriangleAlert, Video } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ALERTS_KEY } from '@/nav'
import { ProductStatusBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber, localized, storefrontUrl } from '@/lib/format'
import type { Paged, ProductDetail, ProductRow } from '@/lib/types'

type Decision = 'approve' | 'reject' | 'unpublish'
const DECISIONS: Record<ProductStatus, Decision[]> = {
  PENDING: ['approve', 'reject'],
  REJECTED: ['approve'],
  PUBLISHED: ['unpublish'],
  DRAFT: [],
}

/** Review queue and all listings (§2.5). `?status=PENDING&q=&shopId=` */
export function ProductsPage() {
  const { t, locale } = useI18n()
  const { params, set, page } = useUrlParams()
  const status = (PRODUCT_STATUSES as readonly string[]).includes(params.get('status') ?? '') ? (params.get('status') as ProductStatus) : undefined
  const q = params.get('q') ?? ''
  const shopId = params.get('shopId') ?? undefined
  const [search, setSearch] = useSearchParamInput(q, set)
  const query = new URLSearchParams({ page: String(page) })
  if (status) query.set('status', status)
  if (q) query.set('q', q)
  if (shopId) query.set('shopId', shopId)
  const list = useQuery({
    queryKey: ['admin', 'products', { status, q, shopId, page }],
    queryFn: () => api<Paged<ProductRow> & { counts: Record<ProductStatus | 'all', number> }>(`/admin/products?${query}`),
    placeholderData: keepPreviousData,
  })
  const tabs: (ProductStatus | 'all')[] = ['PENDING', 'all', 'PUBLISHED', 'REJECTED', 'DRAFT']

  return (
    <>
      <TopBar title={t.products.title} />
      <PageBody>
        <PageIntro title={t.products.title} description={t.products.description} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs
            tabs={tabs.map((k) => ({ key: k, label: k === 'all' ? t.common.all : t.productStatus[k], count: list.data?.counts[k] }))}
            active={status ?? 'all'}
            onSelect={(k) => set({ status: k === 'all' ? undefined : k, page: undefined })}
          />
          <SearchBox value={search} onChange={setSearch} placeholder={t.products.searchPlaceholder} />
        </div>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={status === 'PENDING' ? CheckCircle2 : Package} title={status === 'PENDING' ? t.products.queueEmpty : t.products.emptyTitle} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t.products.title}</TableHead>
                    <TableHead>{t.products.shop}</TableHead>
                    <TableHead>{t.products.category}</TableHead>
                    <TableHead>{t.products.price}</TableHead>
                    <TableHead>{t.products.stock}</TableHead>
                    <TableHead>{t.products.updated}</TableHead>
                    <TableHead className="pr-4">{t.common.status}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="max-w-sm pl-4">
                        <Link to={`/products/${p.id}`} className="flex items-center gap-3">
                          <Thumb src={p.imageUrl} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium hover:underline">{p.name}</span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span className="font-mono">{p.sku}</span>
                              {p.hasVideo && <Video className="size-3" />}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link to={`/shops/${p.shop.id}`} className="hover:underline">
                          {p.shop.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{localized(p.category.name, locale)}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(p.price, locale)}</TableCell>
                      <TableCell className="tabular-nums">{formatNumber(p.stock, locale)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(p.updatedAt, locale)}</TableCell>
                      <TableCell className="pr-4">
                        <ProductStatusBadge status={p.status} />
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
    </>
  )
}

export function ProductDetailPage() {
  const { id = '' } = useParams()
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const product = useQuery({ queryKey: ['admin', 'products', id], queryFn: () => api<ProductDetail>(`/admin/products/${id}`) })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  if (product.isPending || product.isError) {
    return (
      <>
        <TopBar title={t.products.title} backTo="/products" />
        {product.isPending ? <LoadingState /> : <ErrorState onRetry={() => void product.refetch()} />}
      </>
    )
  }
  const p = product.data
  const decide = (d: Decision) =>
    setConfirm({
      title: `${t.products.actions[d]} · ${p.name}`,
      description: t.products.confirm[d],
      confirmLabel: t.products.actions[d],
      destructive: d !== 'approve',
      reason: d === 'approve' ? undefined : { required: true },
      errorText: (e) => (e instanceof ApiError && e.code === 'INVALID_TRANSITION' ? t.shops.errors.INVALID_TRANSITION : t.common.saveError),
      onConfirm: async ({ reason }) => {
        const saved = await send<ProductDetail>('POST', `/admin/products/${p.id}/${d}`, { reason })
        queryClient.setQueryData(['admin', 'products', id], saved)
        void queryClient.invalidateQueries({ queryKey: ['admin', 'products'] })
        void queryClient.invalidateQueries({ queryKey: ALERTS_KEY })
        toast.success(t.products.done)
      },
    })

  return (
    <>
      <TopBar title={p.name} backTo="/products" />
      <PageBody className="max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-semibold tracking-tight">{p.name}</h2>
              <ProductStatusBadge status={p.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              <Link to={`/shops/${p.shop.id}`} className="hover:underline">
                {p.shop.name}
              </Link>{' '}
              · <span className="font-mono">{p.sku}</span> · {formatDate(p.updatedAt, locale, true)}
            </p>
            {p.rejectionReason && p.status === 'REJECTED' && <p className="mt-1 text-sm text-destructive">{fill(t.shops.rejectionReason, { reason: p.rejectionReason })}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {p.status === 'PUBLISHED' && p.shop.status === 'APPROVED' && (
              <Button asChild variant="outline">
                <a href={storefrontUrl.product(locale, p.shop.slug, p.slug)} target="_blank" rel="noreferrer">
                  {t.common.openInStore}
                  <ExternalLink />
                </a>
              </Button>
            )}
            {DECISIONS[p.status].map((d) => (
              <Button key={d} variant={d === 'approve' ? 'default' : 'outline'} className={d === 'approve' ? '' : 'text-destructive hover:text-destructive'} onClick={() => decide(d)}>
                {t.products.actions[d]}
              </Button>
            ))}
          </div>
        </div>

        {p.shop.status !== 'APPROVED' && (
          <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            <TriangleAlert className="size-4 shrink-0" />
            {t.products.shopNotApproved}
          </p>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <Card className="min-w-0 gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t.products.media}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              {p.videoUrl && <video src={p.videoUrl} controls playsInline className="aspect-[9/16] w-40 rounded-xl bg-black object-contain" />}
              {p.imageUrls.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block size-40 overflow-hidden rounded-xl border bg-muted">
                  <img src={u} alt="" className="size-full object-cover" />
                </a>
              ))}
              {!p.videoUrl && p.imageUrls.length === 0 && <ImageOff className="size-6 text-muted-foreground" />}
            </CardContent>
          </Card>
          <Card className="gap-2">
            <CardHeader>
              <CardTitle className="text-base">{t.products.details}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
              <Row label={t.products.price} value={formatMoney(p.price, locale)} />
              {p.compareAtPrice && <Row label={t.products.compareAt} value={formatMoney(p.compareAtPrice, locale)} />}
              <Row label={t.products.stock} value={`${formatNumber(p.stock, locale)} ${localized(p.unit.name, locale)}`} />
              <Row
                label={t.products.category}
                value={[p.category.parent && localized(p.category.parent.name, locale), localized(p.category.name, locale)].filter(Boolean).join(' › ')}
              />
              <Row label={t.products.sold} value={formatNumber(p.soldCount, locale)} />
              <Row label={t.products.views} value={formatNumber(p.viewCount, locale)} />
            </CardContent>
          </Card>
        </div>

        {p.variants.length > 0 && (
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t.products.options}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  {p.variants.map((v) => (
                    <TableRow key={v.sku}>
                      <TableCell>{v.label}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{v.sku}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(v.price ?? p.price, locale)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(v.stock, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {p.description && (
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t.products.description_}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-line">{p.description}</CardContent>
          </Card>
        )}
      </PageBody>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff className="size-4" />}
    </span>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

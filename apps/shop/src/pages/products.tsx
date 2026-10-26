import { PRODUCT_STATUSES, type ProductStatus } from '@talad/shared'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@talad/ui/components/alert-dialog'
import { Button } from '@talad/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@talad/ui/components/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ImageOff, MoreHorizontal, Package, Pencil, Plus, Search, Share2, Trash2, Video } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useAuth } from '@/auth/context'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ShareDialog } from '@/components/share-dialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { ProductStatusBadge } from '@/components/status-badge'
import { queryKeys } from '@/hooks/queries'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatNumber, priceRange, storefrontUrl } from '@/lib/format'
import type { ShopProductList, ShopProductRow } from '@/lib/types'

const isStatus = (v: string | null): v is ProductStatus => !!v && (PRODUCT_STATUSES as readonly string[]).includes(v)

/** The shop's products, every status, with search and status tabs (§3.3). */
export function ProductsPage() {
  const { t } = useI18n()
  const { params, set: update, page } = useUrlParams()
  const status = isStatus(params.get('status')) ? (params.get('status') as ProductStatus) : undefined
  const q = params.get('q') ?? ''
  const [search, setSearch] = useSearchParamInput(q, update)
  const [deleting, setDeleting] = useState<ShopProductRow | null>(null)

  const query = new URLSearchParams({ page: String(page), pageSize: '20' })
  if (status) query.set('status', status)
  if (q) query.set('q', q)
  const list = useQuery({
    queryKey: [...queryKeys.products, { status, q, page }],
    queryFn: () => api<ShopProductList>(`/me/shop/products?${query}`),
    placeholderData: keepPreviousData,
  })
  const data = list.data

  const tabs: { key: ProductStatus | undefined; label: string; count?: number }[] = [
    { key: undefined, label: t.products.all, count: data?.counts.all },
    ...(['PUBLISHED', 'PENDING', 'DRAFT', 'REJECTED'] as const).map((s) => ({
      key: s,
      label: t.productStatus[s],
      count: data?.counts[s],
    })),
  ]

  return (
    <>
      <TopBar title={t.products.title} backTo="/" />
      <PageBody>
        <PageIntro
          title={t.products.title}
          description={t.products.description}
          actions={
            <Button asChild>
              <Link to="/products/new">
                <Plus />
                {t.products.add}
              </Link>
            </Button>
          }
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs
            tabs={tabs.map((tab) => ({ key: tab.key ?? 'all', label: tab.label, count: tab.count }))}
            active={status ?? 'all'}
            onSelect={(key) => update({ status: key === 'all' ? undefined : key, page: undefined })}
          />
          <SearchBox value={search} onChange={setSearch} placeholder={t.products.searchPlaceholder} />
        </div>

        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : data!.items.length === 0 ? (
          data!.counts.all === 0 ? (
            <EmptyState
              icon={Package}
              title={t.products.emptyTitle}
              body={t.products.emptyBody}
              action={
                <Button asChild>
                  <Link to="/products/new">
                    <Plus />
                    {t.products.add}
                  </Link>
                </Button>
              }
            />
          ) : (
            <EmptyState icon={Search} title={t.products.noMatchTitle} body={t.products.noMatchBody} />
          )
        ) : (
          <>
            <ProductTable items={data!.items} onDelete={setDeleting} />
            <ProductCards items={data!.items} onDelete={setDeleting} />
            <Pager page={data!.page} totalPages={data!.totalPages} onPage={(p) => update({ page: String(p) })} />
          </>
        )}
      </PageBody>

      <DeleteProductDialog product={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
      {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff className="size-5" />}
    </span>
  )
}

function StockCell({ p }: { p: ShopProductRow }) {
  const { t, locale } = useI18n()
  return (
    <span className="flex flex-col">
      <span className={cn('tabular-nums', p.stock === 0 ? 'text-destructive' : p.lowStock && 'text-orange-600 dark:text-orange-400')}>
        {formatNumber(p.stock, locale)}
      </span>
      {p.stock === 0 ? (
        <span className="text-xs text-destructive">{t.products.outOfStock}</span>
      ) : (
        p.lowStock && <span className="text-xs text-orange-600 dark:text-orange-400">{t.products.lowStock}</span>
      )}
    </span>
  )
}

function Meta({ p }: { p: ShopProductRow }) {
  const { t } = useI18n()
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
      <span className="font-mono">{p.sku}</span>
      {p.variantCount > 0 && <span>· {fill(t.products.options, { n: p.variantCount })}</span>}
      {p.hasVideo && (
        <span className="inline-flex items-center gap-0.5">
          · <Video className="size-3" /> {t.products.hasVideo}
        </span>
      )}
    </span>
  )
}

function RowActions({ p, onDelete }: { p: ShopProductRow; onDelete: (p: ShopProductRow) => void }) {
  const { t, locale } = useI18n()
  const { account } = useAuth()
  const navigate = useNavigate()
  const [sharing, setSharing] = useState(false)
  // A product page exists only for published products of a live shop.
  const url = p.status === 'PUBLISHED' && account?.shop?.status === 'APPROVED' ? storefrontUrl.product(locale, account.shop.slug, p.slug) : null
  return (
    <span className="flex items-center justify-end gap-0.5">
      {url && (
        <Button variant="ghost" size="icon" aria-label={t.share.share} title={t.share.share} onClick={() => setSharing(true)}>
          <Share2 />
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t.common.edit}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => navigate(`/products/${p.id}`)}>
            <Pencil />
            {t.common.edit}
          </DropdownMenuItem>
          {url && (
            <>
              <DropdownMenuItem onSelect={() => setSharing(true)}>
                <Share2 />
                {t.share.share}
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  {t.products.viewInStore}
                </a>
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onDelete(p)}>
            <Trash2 />
            {t.common.delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {url && <ShareDialog open={sharing} onOpenChange={setSharing} url={url} title={p.name} heading={t.share.productHeading} />}
    </span>
  )
}

function ProductTable({ items, onDelete }: { items: ShopProductRow[]; onDelete: (p: ShopProductRow) => void }) {
  const { t, locale } = useI18n()
  return (
    <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">{t.products.product}</TableHead>
            <TableHead>{t.products.price}</TableHead>
            <TableHead>{t.products.stock}</TableHead>
            <TableHead>{t.products.sold}</TableHead>
            <TableHead>{t.products.status}</TableHead>
            <TableHead>{t.products.updated}</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="max-w-md pl-4">
                <Link to={`/products/${p.id}`} className="flex items-center gap-3">
                  <Thumb src={p.imageUrl} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium hover:underline">{p.name}</span>
                    <Meta p={p} />
                    {p.status === 'REJECTED' && p.rejectionReason && (
                      <span className="block truncate text-xs text-destructive">
                        {fill(t.products.rejectedBecause, { reason: p.rejectionReason })}
                      </span>
                    )}
                  </span>
                </Link>
              </TableCell>
              <TableCell className="tabular-nums">{priceRange(p.price, p.priceMax, locale)}</TableCell>
              <TableCell>
                <StockCell p={p} />
              </TableCell>
              <TableCell className="tabular-nums">{formatNumber(p.soldCount, locale)}</TableCell>
              <TableCell>
                <ProductStatusBadge status={p.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(p.updatedAt, locale)}</TableCell>
              <TableCell>
                <RowActions p={p} onDelete={onDelete} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function ProductCards({ items, onDelete }: { items: ShopProductRow[]; onDelete: (p: ShopProductRow) => void }) {
  const { t, locale } = useI18n()
  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {items.map((p) => (
        <li key={p.id} className="flex items-start gap-3 rounded-xl border bg-card p-3">
          <Link to={`/products/${p.id}`} className="flex min-w-0 flex-1 items-start gap-3">
            <Thumb src={p.imageUrl} />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-sm font-medium">{p.name}</span>
              <Meta p={p} />
              <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold tabular-nums">{priceRange(p.price, p.priceMax, locale)}</span>
                <ProductStatusBadge status={p.status} />
              </span>
              <span className="mt-1 flex gap-3 text-xs text-muted-foreground">
                <span className={cn(p.stock === 0 ? 'text-destructive' : p.lowStock && 'text-orange-600')}>
                  {t.products.stock}: {formatNumber(p.stock, locale)}
                </span>
                <span>
                  {t.products.sold}: {formatNumber(p.soldCount, locale)}
                </span>
              </span>
              {p.status === 'REJECTED' && p.rejectionReason && (
                <span className="mt-1 block text-xs text-destructive">
                  {fill(t.products.rejectedBecause, { reason: p.rejectionReason })}
                </span>
              )}
            </span>
          </Link>
          <RowActions p={p} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  )
}

function DeleteProductDialog({ product, onClose }: { product: ShopProductRow | null; onClose: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (id: string) => send('DELETE', `/me/shop/products/${id}`),
    onSuccess: () => {
      toast.success(t.products.deleted)
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop })
      onClose()
    },
    onError: (e) => {
      toast.error(e instanceof ApiError && e.code === 'PRODUCT_HAS_ORDERS' ? t.products.hasOrders : t.common.saveError)
      onClose()
    },
  })

  return (
    <AlertDialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.products.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>{fill(t.products.deleteBody, { name: product?.name ?? '' })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (product) remove.mutate(product.id)
            }}
          >
            {t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

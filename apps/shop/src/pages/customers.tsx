import { formatPhone } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Label } from '@talad/ui/components/label'
import { Switch } from '@talad/ui/components/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, ChevronRight, LoaderCircle, StickyNote, Users } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { FollowersButton } from '@/components/followers-dialog'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { OrderStatusBadge } from '@/components/status-badge'
import { queryKeys } from '@/hooks/queries'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import type { ShopCustomer, ShopCustomerList } from '@/lib/types'
import type { OrderStatus } from '@talad/shared'

/** People who bought from the shop, with private notes and a blacklist (§3.5). */
export function CustomersPage() {
  const { t, locale } = useI18n()
  const { params, set, page } = useUrlParams()
  const q = params.get('q') ?? ''
  const blocked = params.get('blocked') === '1'
  const [search, setSearch] = useSearchParamInput(q, set)
  const [open, setOpen] = useState<ShopCustomer | null>(null)

  const query = new URLSearchParams({ page: String(page) })
  if (q) query.set('q', q)
  if (blocked) query.set('blacklisted', 'true')
  const list = useQuery({
    queryKey: [...queryKeys.customers, { q, blocked, page }],
    queryFn: () => api<ShopCustomerList>(`/me/shop/customers?${query}`),
    placeholderData: keepPreviousData,
  })

  return (
    <>
      <TopBar title={t.customers.title} backTo="/" />
      <PageBody>
        <PageIntro title={t.customers.title} description={t.customers.description} actions={<FollowersButton />} />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <FilterTabs
            tabs={[
              { key: 'all', label: t.common.viewAll },
              { key: 'blocked', label: t.customers.onlyBlocked },
            ]}
            active={blocked ? 'blocked' : 'all'}
            onSelect={(k) => set({ blocked: k === 'blocked' ? '1' : undefined, page: undefined })}
          />
          <SearchBox value={search} onChange={setSearch} placeholder={t.customers.searchPlaceholder} />
        </div>

        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Users} title={t.customers.emptyTitle} body={t.customers.emptyBody} />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4">{t.orders.customer}</TableHead>
                    <TableHead>{t.customers.orders}</TableHead>
                    <TableHead>{t.customers.spent}</TableHead>
                    <TableHead>{t.customers.lastOrder}</TableHead>
                    <TableHead>{t.customers.note}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.items.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => setOpen(c)}>
                      <TableCell className="pl-4">
                        <Name c={c} />
                      </TableCell>
                      <TableCell className="tabular-nums">{formatNumber(c.orderCount, locale)}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(c.totalSpent, locale)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(c.lastOrderAt, locale)}</TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">{c.note ?? '—'}</TableCell>
                      <TableCell>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {list.data.items.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setOpen(c)} className="flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left">
                    <span className="min-w-0 flex-1">
                      <Name c={c} />
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {formatNumber(c.orderCount, locale)} {t.customers.orders} · {formatMoney(c.totalSpent, locale)} · {formatDate(c.lastOrderAt, locale)}
                      </span>
                      {c.note && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <StickyNote className="size-3" />
                          <span className="truncate">{c.note}</span>
                        </span>
                      )}
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </PageBody>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          {open && <CustomerPanel key={open.id} customer={open} onDone={() => setOpen(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

function Name({ c }: { c: ShopCustomer }) {
  const { t } = useI18n()
  return (
    <span className="flex flex-col">
      <span className="flex items-center gap-2 font-medium">
        {c.name}
        {c.blacklisted && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            <Ban className="size-3" />
            {t.customers.blocked}
          </span>
        )}
      </span>
      {c.phone && <span className="text-xs text-muted-foreground">{formatPhone(c.phone)}</span>}
    </span>
  )
}

function CustomerPanel({ customer: c, onDone }: { customer: ShopCustomer; onDone: () => void }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [note, setNote] = useState(c.note ?? '')
  const [blacklisted, setBlacklisted] = useState(c.blacklisted)
  const orders = useQuery({
    queryKey: [...queryKeys.customers, c.id, 'orders'],
    queryFn: () => api<{ number: string; status: OrderStatus; total: number; createdAt: string }[]>(`/me/shop/customers/${c.id}/orders`),
  })
  const save = useMutation({
    mutationFn: () => send('PUT', `/me/shop/customers/${c.id}`, { note: note.trim() || null, blacklisted }),
    onSuccess: () => {
      toast.success(t.customers.saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers })
      onDone()
    },
    onError: () => toast.error(t.common.saveError),
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{c.name}</DialogTitle>
        <DialogDescription>
          {c.phone ? formatPhone(c.phone) : ''} · {formatNumber(c.orderCount, locale)} {t.customers.orders} · {formatMoney(c.totalSpent, locale)}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="note">{t.customers.note}</Label>
        <Textarea id="note" rows={3} maxLength={1000} value={note} placeholder={t.customers.notePlaceholder} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className={cn('flex items-start gap-3 rounded-lg border p-3', blacklisted && 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950')}>
        <Switch checked={blacklisted} onCheckedChange={setBlacklisted} className="mt-0.5 data-[state=checked]:bg-destructive" />
        <span>
          <span className="block text-sm font-medium">{t.customers.block}</span>
          <span className="block text-xs text-muted-foreground">{t.customers.blockHint}</span>
        </span>
      </label>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t.customers.recentOrders}</p>
        {orders.isPending ? (
          <LoadingState className="py-4" />
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {orders.data?.map((o) => (
              <li key={o.number}>
                <Link to={`/orders/${o.number}`} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                  <span className="font-mono">{o.number}</span>
                  <OrderStatusBadge status={o.status} />
                  <span className="ml-auto tabular-nums">{formatMoney(o.total, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" />}
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

import { FLASH_SALE_RULES } from '@talad/shared'
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
import { Card, CardContent } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { Switch } from '@talad/ui/components/switch'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, ImageOff, LoaderCircle, Pencil, Plus, Search, Trash2, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { FlashSaleStateBadge } from '@/components/status-badge'
import { queryKeys } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatMoney, toLocalInput } from '@/lib/format'
import type { ShopFlashSale, ShopProductList } from '@/lib/types'

type ErrorKey = keyof Dict['marketing']['errors']
const salePrice = (price: number, percent: number) => Math.round((price * (100 - percent)) / 100)

type Preset = keyof Dict['marketing']['presets']
/** End-of-month sales run from this day to the month's last day. */
const MONTH_END_FROM = 25

/** Start and end for a quick-date chip; times end at 23:59 so a sale covers the whole last day. */
function presetRange(preset: Preset, now = new Date()): { start: Date; end: Date } {
  const start = new Date(now)
  start.setSeconds(0, 0)
  const end = new Date(start)
  if (preset === 'endOfMonth') {
    const from = new Date(now.getFullYear(), now.getMonth(), MONTH_END_FROM)
    end.setMonth(now.getMonth() + 1, 0) // last day of this month
    end.setHours(23, 59, 0, 0)
    return { start: from > now ? from : start, end }
  }
  end.setDate(end.getDate() + { today: 0, threeDays: 2, week: 6 }[preset])
  end.setHours(23, 59, 0, 0)
  return { start, end }
}

/** Flash sales (§3.4): scheduled percentage discounts on chosen products. */
export function MarketingPage() {
  const { t } = useI18n()
  const sales = useQuery({ queryKey: queryKeys.flashSales, queryFn: () => api<ShopFlashSale[]>('/me/shop/flash-sales') })
  const [editing, setEditing] = useState<ShopFlashSale | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ShopFlashSale | null>(null)

  const create = (
    <Button onClick={() => setEditing('new')}>
      <Plus />
      {t.marketing.create}
    </Button>
  )

  return (
    <>
      <TopBar title={t.nav.marketing} backTo="/" />
      <PageBody>
        <PageIntro title={t.marketing.title} description={t.marketing.description} actions={create} />
        {sales.isPending ? (
          <LoadingState />
        ) : sales.isError ? (
          <ErrorState onRetry={() => void sales.refetch()} />
        ) : sales.data.length === 0 ? (
          <EmptyState icon={Zap} title={t.marketing.emptyTitle} body={t.marketing.emptyBody} action={create} />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {sales.data.map((s) => (
              <li key={s.id}>
                <SaleCard sale={s} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} />
              </li>
            ))}
          </ul>
        )}
      </PageBody>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
          {editing && <SaleForm key={editing === 'new' ? 'new' : editing.id} sale={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
      <DeleteSaleDialog sale={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

function SaleCard({ sale: s, onEdit, onDelete }: { sale: ShopFlashSale; onEdit: () => void; onDelete: () => void }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => send<ShopFlashSale>('PATCH', `/me/shop/flash-sales/${s.id}`, { isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.flashSales }),
    onError: (e) => toast.error(e instanceof ApiError && e.code === 'PRODUCT_IN_OTHER_SALE' ? fill(t.marketing.errors.PRODUCT_IN_OTHER_SALE, { sale: String(e.body.sale ?? '') }) : t.common.saveError),
  })
  const ended = s.state === 'ENDED'

  return (
    <Card className={cn('h-full gap-3 py-0', ended && 'opacity-70')}>
      <div className="flex items-center justify-between gap-2 border-b bg-red-50/60 px-4 py-3 dark:bg-red-950/30">
        <span className="flex min-w-0 items-center gap-2 font-semibold">
          <Zap className="size-4 shrink-0 fill-current text-red-500" />
          <span className="truncate">{s.name}</span>
        </span>
        <FlashSaleStateBadge state={s.state} />
      </div>
      <CardContent className="flex flex-1 flex-col gap-3 px-4">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarRange className="size-4" />
          {formatDate(s.startsAt, locale, true)} – {formatDate(s.endsAt, locale, true)}
        </p>
        <ul className="flex flex-col gap-2">
          {s.items.slice(0, 4).map((i) => (
            <li key={i.productId} className="flex items-center gap-3 text-sm">
              <Thumb src={i.imageUrl} />
              <span className="min-w-0 flex-1 truncate">{i.name}</span>
              <span className="shrink-0 rounded bg-red-500 px-1.5 py-0.5 text-xs font-semibold text-white">−{i.discountPercent}%</span>
              <span className="w-24 shrink-0 text-right tabular-nums">
                <span className="block font-medium text-red-600 dark:text-red-400">{formatMoney(i.salePrice, locale)}</span>
                <span className="block text-xs text-muted-foreground line-through">{formatMoney(i.price, locale)}</span>
              </span>
            </li>
          ))}
        </ul>
        {s.items.length > 4 && <p className="text-xs text-muted-foreground">+{s.items.length - 4}</p>}
      </CardContent>
      <div className="flex items-center justify-between border-t px-4 py-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={s.isActive} disabled={ended || toggle.isPending} onCheckedChange={(on) => toggle.mutate(on)} />
          {t.marketing.active}
        </label>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={t.common.edit} disabled={ended} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t.common.delete} className="hover:text-destructive" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </Card>
  )
}

interface ItemRow {
  productId: string
  name: string
  imageUrl: string | null
  price: number
  percent: string
}

function SaleForm({ sale, onDone }: { sale: ShopFlashSale | null; onDone: () => void }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [name, setName] = useState(sale?.name ?? '')
  const [startsAt, setStartsAt] = useState(() => toLocalInput(sale ? new Date(sale.startsAt) : new Date()))
  const [endsAt, setEndsAt] = useState(() => toLocalInput(sale ? new Date(sale.endsAt) : new Date(Date.now() + 2 * 86_400_000)))
  const [isActive, setIsActive] = useState(sale?.isActive ?? true)
  const [items, setItems] = useState<ItemRow[]>(
    () => sale?.items.map((i) => ({ productId: i.productId, name: i.name, imageUrl: i.imageUrl, price: i.price, percent: String(i.discountPercent) })) ?? [],
  )
  const [allPercent, setAllPercent] = useState('')
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { minPercent: min, maxPercent: max } = FLASH_SALE_RULES

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(id)
  }, [search])
  const candidates = useQuery({
    queryKey: [...queryKeys.products, { picker: debounced }],
    queryFn: () => api<ShopProductList>(`/me/shop/products?status=PUBLISHED&pageSize=20${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`),
  })

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        isActive,
        items: items.map((i) => ({ productId: i.productId, discountPercent: Number(i.percent) })),
      }
      return sale ? send('PUT', `/me/shop/flash-sales/${sale.id}`, body) : send('POST', '/me/shop/flash-sales', body)
    },
    onSuccess: () => {
      toast.success(t.marketing.saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.flashSales })
      onDone()
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined
      if (code && code in t.marketing.errors) {
        setError(fill(t.marketing.errors[code as ErrorKey], { days: FLASH_SALE_RULES.maxDays, sale: String((e as ApiError).body.sale ?? '') }))
      } else setError(t.common.saveError)
    },
  })

  function submit() {
    setError(null)
    if (!name.trim()) return setError(t.marketing.errors.name)
    if (!(new Date(endsAt) > new Date(startsAt)) || new Date(endsAt) <= new Date()) return setError(t.marketing.errors.dates)
    if (items.length === 0) return setError(t.marketing.errors.items)
    if (items.some((i) => !(Number(i.percent) >= min && Number(i.percent) <= max && Number.isInteger(Number(i.percent))))) {
      return setError(fill(t.marketing.errors.percent, { min, max }))
    }
    save.mutate()
  }

  const chosen = new Set(items.map((i) => i.productId))
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{sale ? t.marketing.editTitle : t.marketing.createTitle}</DialogTitle>
        <DialogDescription>{fill(t.marketing.maxDaysHint, { days: FLASH_SALE_RULES.maxDays, min, max })}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="saleName" required>{t.marketing.name}</Label>
        <Input id="saleName" value={name} maxLength={FLASH_SALE_RULES.nameMax} placeholder={t.marketing.namePlaceholder} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saleStart" required>{t.marketing.startsAt}</Label>
          <Input id="saleStart" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saleEnd" required>{t.marketing.endsAt}</Label>
          <Input id="saleEnd" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
      <div className="-mt-1 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">{t.marketing.quickDates}</span>
          {(Object.keys(t.marketing.presets) as Preset[]).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant="outline"
              className={cn('h-7 rounded-full px-3 text-xs', p === 'endOfMonth' && 'border-red-300 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950')}
              onClick={() => {
                const { start, end } = presetRange(p)
                setStartsAt(toLocalInput(start))
                setEndsAt(toLocalInput(end))
                if (p === 'endOfMonth' && !name.trim()) setName(t.marketing.presets.endOfMonth)
              }}
            >
              {p === 'endOfMonth' && <CalendarRange className="size-3.5" />}
              {t.marketing.presets[p]}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {fill(t.marketing.endOfMonthHint, { from: formatDate(presetRange('endOfMonth').start.toISOString(), locale) })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label required>{t.marketing.products}</Label>
        {items.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t.marketing.setAll}</span>
            <Input
              aria-label={t.marketing.setAll}
              inputMode="numeric"
              value={allPercent}
              placeholder="10"
              onChange={(e) => setAllPercent(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className="h-8 w-14 text-right"
            />
            <span className="text-muted-foreground">%</span>
            <Button type="button" size="sm" variant="secondary" disabled={!allPercent} onClick={() => setItems((l) => l.map((x) => ({ ...x, percent: allPercent })))}>
              {t.marketing.apply}
            </Button>
          </div>
        )}
        {items.length > 0 && (
          <ul className="flex flex-col divide-y rounded-lg border">
            {items.map((i) => {
              const pct = Number(i.percent)
              const ok = pct >= min && pct <= max
              return (
                <li key={i.productId} className="flex items-center gap-3 p-2">
                  <Thumb src={i.imageUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{i.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatMoney(i.price, locale)} → <span className="font-medium text-red-600 dark:text-red-400">{ok ? formatMoney(salePrice(i.price, pct), locale) : '—'}</span>
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Input
                      aria-label={t.marketing.percentOff}
                      inputMode="numeric"
                      value={i.percent}
                      onChange={(e) => setItems((l) => l.map((x) => (x.productId === i.productId ? { ...x, percent: e.target.value.replace(/\D/g, '').slice(0, 2) } : x)))}
                      className="h-8 w-14 text-right"
                      aria-invalid={!ok || undefined}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </span>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label={t.marketing.remove} onClick={() => setItems((l) => l.filter((x) => x.productId !== i.productId))}>
                    <X />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {items.length < FLASH_SALE_RULES.maxItems && (
          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} placeholder={t.marketing.searchProducts} className="pl-9" onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!candidates.data?.items.some((p) => !chosen.has(p.id))}
                onClick={() =>
                  setItems((l) => [
                    ...l,
                    ...(candidates.data?.items ?? [])
                      .filter((p) => !chosen.has(p.id))
                      .slice(0, FLASH_SALE_RULES.maxItems - l.length)
                      .map((p) => ({ productId: p.id, name: p.name, imageUrl: p.imageUrl, price: p.price, percent: allPercent || '10' })),
                  ])
                }
              >
                <Plus />
                {t.marketing.addAllShown}
              </Button>
            </div>
            <ul className="flex max-h-56 flex-col overflow-y-auto">
              {candidates.data?.items
                .filter((p) => !chosen.has(p.id))
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setItems((l) => [...l, { productId: p.id, name: p.name, imageUrl: p.imageUrl, price: p.price, percent: allPercent || '10' }])}
                      className="flex w-full items-center gap-3 rounded-md p-1.5 text-left text-sm hover:bg-muted"
                    >
                      <Thumb src={p.imageUrl} />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatMoney(p.price, locale)}</span>
                      <Plus className="size-4 text-primary" />
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        {t.marketing.active}
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

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

function DeleteSaleDialog({ sale, onClose }: { sale: ShopFlashSale | null; onClose: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (id: string) => send('DELETE', `/me/shop/flash-sales/${id}`),
    onSuccess: () => {
      toast.success(t.marketing.deleted)
      void queryClient.invalidateQueries({ queryKey: queryKeys.flashSales })
      onClose()
    },
    onError: () => toast.error(t.common.saveError),
  })
  return (
    <AlertDialog open={sale !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fill(t.marketing.deleteTitle, { name: sale?.name ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription>{t.marketing.deleteBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (sale) remove.mutate(sale.id)
            }}
          >
            {t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
      {src ? <img src={src} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff className="size-3.5" />}
    </span>
  )
}

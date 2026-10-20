import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { CircleCheck, Clock, LoaderCircle, Minus, Package, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatMoney } from '@/lib/format'
import type { ChatOrderSummary, ShopProductDetail, ShopProductList, ShopProductRow } from '@/lib/types'

/** Buy by chat: an order card in a chat, as the shop sees it (the customer completes and places it). */
export function SellerOrderCard({ order, onCancel }: { order: ChatOrderSummary; onCancel?: () => void }) {
  const { t, locale } = useI18n()
  const s = t.chatOrder
  const placed = order.status === 'PLACED'
  const cancelled = order.status === 'CANCELLED'
  return (
    <div className={cn('w-full max-w-sm overflow-hidden rounded-2xl bg-card shadow-sm ring-1', placed ? 'ring-primary/30' : 'ring-border', cancelled && 'opacity-70')}>
      <div className="flex items-center gap-2.5 border-b px-3.5 py-2.5">
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            placed ? 'bg-primary text-primary-foreground' : cancelled ? 'bg-muted text-muted-foreground' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
          )}
        >
          {placed ? <CircleCheck className="size-4" /> : cancelled ? <X className="size-4" /> : <Clock className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{placed ? s.placed : cancelled ? s.cancelled : s.draft}</p>
          <p className="truncate text-[11px] text-muted-foreground">{placed && order.orderNumber ? order.orderNumber : s.by[order.createdBy]}</p>
        </div>
        <ShoppingBag className="size-4 text-muted-foreground" />
      </div>
      <ul className="flex flex-col gap-2 px-3.5 py-2.5">
        {order.items.map((i, n) => (
          <li key={n} className={cn('flex items-center gap-2.5 text-sm', cancelled && 'line-through')}>
            <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
              {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 font-medium">{i.name}</span>
              {i.variantLabel && <span className="text-xs text-muted-foreground">{i.variantLabel}</span>}
            </span>
            <span className="shrink-0 tabular-nums">× {i.quantity}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/40 px-3.5 py-2">
        {/* 0 while the customer still has to choose an option (size…). */}
        <span className="text-sm font-semibold text-primary tabular-nums">{order.total > 0 ? formatMoney(order.total, locale) : '—'}</span>
        {placed && order.orderNumber ? (
          <Link to={`/orders/${order.orderNumber}`} className="text-xs font-semibold text-primary hover:underline">
            {fill(s.viewOrder, { number: order.orderNumber })}
          </Link>
        ) : (
          !cancelled &&
          onCancel && (
            <button
              type="button"
              onClick={() => window.confirm(s.cancelConfirm) && onCancel()}
              className="text-xs font-medium text-muted-foreground hover:text-destructive"
            >
              {s.cancel}
            </button>
          )
        )}
      </div>
      {!placed && !cancelled && <p className="px-3.5 pb-2.5 text-[11px] text-muted-foreground">{s.draftBody}</p>}
    </div>
  )
}

interface Pick {
  product: ShopProductRow
  variantId: string | null
  variantLabel: string | null
  quantity: number
}

/**
 * Facebook-style selling: the seller picks products (and options, or leaves them to the
 * customer) and sends an order card; the customer checks it and places the order in the chat.
 */
export function SendOrderDialog({ conversationId, customerName, onClose, onSent }: { conversationId: string; customerName: string; onClose: () => void; onSent: () => void }) {
  const { t, locale } = useI18n()
  const s = t.chatOrder
  const [q, setQ] = useState('')
  const [picks, setPicks] = useState<Pick[]>([])
  const [choosing, setChoosing] = useState<ShopProductRow | null>(null)
  const query = new URLSearchParams({ status: 'PUBLISHED', pageSize: '20' })
  if (q.trim()) query.set('q', q.trim())
  const list = useQuery({
    queryKey: ['shop', 'products', 'chat-order', q.trim()],
    queryFn: () => api<ShopProductList>(`/me/shop/products?${query}`),
    placeholderData: keepPreviousData,
  })
  const detail = useQuery({
    queryKey: ['shop', 'products', choosing?.id],
    queryFn: () => api<ShopProductDetail>(`/me/shop/products/${choosing!.id}`),
    enabled: !!choosing && choosing.variantCount > 0,
  })
  const sendOrder = useMutation({
    mutationFn: () =>
      send('POST', `/me/shop/conversations/${conversationId}/orders`, {
        items: picks.map((p) => ({ productId: p.product.id, variantId: p.variantId, quantity: p.quantity })),
      }),
    onSuccess: () => {
      toast.success(s.sent)
      onSent()
      onClose()
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined
      toast.error(code && code in s.errors ? s.errors[code as keyof typeof s.errors] : s.errors.generic)
    },
  })

  function add(product: ShopProductRow, variantId: string | null, variantLabel: string | null) {
    setPicks((prev) => {
      const same = prev.findIndex((p) => p.product.id === product.id && p.variantId === variantId)
      if (same >= 0) return prev.map((p, i) => (i === same ? { ...p, quantity: Math.min(99, p.quantity + 1) } : p))
      return prev.length >= 10 ? prev : [...prev, { product, variantId, variantLabel, quantity: 1 }]
    })
    setChoosing(null)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{fill(s.sendTitle, { name: customerName })}</DialogTitle>
          <DialogDescription>{s.sendBody}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={s.search} aria-label={s.search} className="pl-9" />
        </div>
        <ul className="flex max-h-60 flex-col divide-y overflow-y-auto rounded-xl border">
          {list.isPending ? (
            <li className="flex justify-center p-6 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
            </li>
          ) : !list.data?.items.length ? (
            <li className="p-6 text-center text-sm text-muted-foreground">{s.noProducts}</li>
          ) : (
            list.data.items.map((p) => (
              <li key={p.id} className="flex flex-col">
                <div className="flex items-center gap-3 px-3 py-2">
                  <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                    {p.imageUrl ? <img src={p.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatMoney(p.price, locale)}
                      {p.priceMax ? ` – ${formatMoney(p.priceMax, locale)}` : ''}
                    </span>
                  </span>
                  <Button size="sm" variant="outline" onClick={() => (p.variantCount > 0 ? setChoosing(choosing?.id === p.id ? null : p) : add(p, null, null))}>
                    <Plus /> {s.add}
                  </Button>
                </div>
                {choosing?.id === p.id && (
                  <div className="flex flex-wrap items-center gap-1.5 bg-muted/50 px-3 py-2">
                    <span className="text-xs text-muted-foreground">{detail.data?.variantOption ?? s.options}:</span>
                    {detail.isPending ? (
                      <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      detail.data?.variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          disabled={v.stock < 1}
                          onClick={() => add(p, v.id, v.value)}
                          className="rounded-full bg-background px-2.5 py-1 text-xs font-medium ring-1 ring-border hover:ring-primary disabled:line-through disabled:opacity-40"
                        >
                          {v.value}
                        </button>
                      ))
                    )}
                    <button type="button" onClick={() => add(p, null, null)} className="rounded-full px-2.5 py-1 text-xs font-medium text-primary hover:underline">
                      {s.customerChooses}
                    </button>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>

        <div>
          <p className="mb-2 text-sm font-semibold">{s.selected}</p>
          {picks.length === 0 ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{s.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {picks.map((p, i) => (
                <li key={`${p.product.id}-${p.variantId}`} className="flex items-center gap-2 rounded-xl border px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-sm font-medium">{p.product.name}</span>
                    <span className="text-xs text-muted-foreground">{p.variantLabel ?? (p.product.variantCount > 0 ? s.customerChooses : '')}</span>
                  </span>
                  <div className="flex items-center rounded-full ring-1 ring-border" aria-label={s.quantity}>
                    <button
                      type="button"
                      disabled={p.quantity <= 1}
                      onClick={() => setPicks((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: x.quantity - 1 } : x)))}
                      className="flex size-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm tabular-nums">{p.quantity}</span>
                    <button
                      type="button"
                      disabled={p.quantity >= 99}
                      onClick={() => setPicks((prev) => prev.map((x, j) => (j === i ? { ...x, quantity: x.quantity + 1 } : x)))}
                      className="flex size-7 items-center justify-center rounded-full hover:bg-muted disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <Button variant="ghost" size="icon" className="hover:text-destructive" onClick={() => setPicks((prev) => prev.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.chatbot.cancel}
          </Button>
          <Button onClick={() => sendOrder.mutate()} disabled={!picks.length || sendOrder.isPending}>
            {sendOrder.isPending ? <LoaderCircle className="animate-spin" /> : <ShoppingBag />}
            {s.send}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

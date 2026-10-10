import { formatPhone, provinceName, type Locale, type ShopOrderAction } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@talad/ui/components/dropdown-menu'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, ImageOff, LoaderCircle, MapPin, MoreHorizontal, Phone, Printer, ScanSearch, TriangleAlert, Truck, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { PageBody, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { OrderStatusBadge } from '@/components/status-badge'
import { queryKeys, useDeliveryProviders, useMyShop } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, getToken, send } from '@/lib/api'
import { fill, formatDate, formatMoney } from '@/lib/format'
import type { ShopOrderDetail } from '@/lib/types'

/** The main next step first; destructive ones last. */
const PRIMARY: ShopOrderAction[] = ['confirm', 'pack', 'ship', 'deliver', 'approve-return']
const NEEDS_REASON: ShopOrderAction[] = ['cancel', 'reject-payment', 'reject-return']

/** One order: what to send where, payment, and the next fulfilment step (§3.6). */
export function OrderDetailPage() {
  const { number = '' } = useParams()
  const { t, locale } = useI18n()
  const order = useQuery({
    queryKey: queryKeys.order(number),
    queryFn: () => api<ShopOrderDetail>(`/me/shop/orders/${encodeURIComponent(number)}`),
  })
  const shop = useMyShop()
  const [action, setAction] = useState<ShopOrderAction | null>(null)

  if (order.isPending) {
    return (
      <>
        <TopBar title={number} backTo="/orders" />
        <LoadingState />
      </>
    )
  }
  if (order.isError) {
    return (
      <>
        <TopBar title={number} backTo="/orders" />
        <PageBody>
          <ErrorState onRetry={() => void order.refetch()} />
        </PageBody>
      </>
    )
  }
  const o = order.data
  const actions = [...o.actions].sort((a, b) => Number(PRIMARY.includes(b)) - Number(PRIMARY.includes(a)))
  const net = o.total - o.commissionAmount
  const address = o.shippingAddress

  return (
    <>
      <TopBar title={o.number} backTo="/orders" />
      <PageBody className="max-w-5xl pb-28 md:pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xl font-semibold md:text-2xl">{o.number}</h2>
              <OrderStatusBadge status={o.status} />
            </div>
            <p className="text-sm text-muted-foreground">{fill(t.orders.placed, { date: formatDate(o.createdAt, locale, true) })}</p>
          </div>
          <Button variant="outline" onClick={() => printPackingSlip(o, shop.data?.name ?? '', t, locale)}>
            <Printer />
            {t.orders.printSlip}
          </Button>
        </div>

        {o.awaitingConfirmation && (
          <Notice tone="warn" icon={ScanSearch}>
            {t.orders.slipNotice}
          </Notice>
        )}
        {o.cancelReason && o.status === 'CANCELLED' && (
          <Notice tone="muted" icon={TriangleAlert}>
            {fill(t.orders.cancelReason, { reason: o.cancelReason })}
          </Notice>
        )}
        {o.dispute && (
          <Notice tone="danger" icon={TriangleAlert}>
            {fill(t.orders.disputeOpen, { reason: o.dispute.reason })}
          </Notice>
        )}

        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          <div className="flex min-w-0 flex-col gap-5">
            <Card className="gap-3">
              <CardContent className="flex flex-col gap-3">
                {o.items.map((i) => (
                  <div key={i.sku} className="flex items-center gap-3">
                    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                      {i.imageUrl ? <img src={i.imageUrl} alt="" className="size-full object-cover" /> : <ImageOff className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium">{i.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        <span className="font-mono">{i.sku}</span>
                        {i.variant && ` · ${i.variant}`}
                      </span>
                    </span>
                    <span className="text-right text-sm tabular-nums">
                      <span className="block text-muted-foreground">
                        {formatMoney(i.unitPrice, locale)} × {i.quantity}
                      </span>
                      <span className="font-medium">{formatMoney(i.lineTotal, locale)}</span>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t.orders.shipTo}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p className="flex items-center gap-2">
                  <UserRound className="size-4 text-muted-foreground" />
                  {address?.recipientName ?? o.customer.name}
                </p>
                {(address?.phone ?? o.customer.phone) && (
                  <a href={`tel:${address?.phone ?? o.customer.phone}`} className="flex items-center gap-2 text-primary">
                    <Phone className="size-4" />
                    {formatPhone(address?.phone ?? o.customer.phone ?? '')}
                  </a>
                )}
                {address && (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {formatAddress(address, locale)}
                  </p>
                )}
                {o.note && (
                  <p className="mt-1 rounded-lg bg-muted px-3 py-2">
                    <span className="block text-xs text-muted-foreground">{t.orders.note}</span>
                    {o.note}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t.orders.timeline}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="relative flex flex-col gap-4 border-l pl-5">
                  {[...o.history].reverse().map((h, i) => (
                    <li key={i} className="relative">
                      <span className={cn('absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-card', i === 0 ? 'bg-primary' : 'bg-muted-foreground/40')} />
                      <p className="text-sm font-medium">{t.orders.status[h.status]}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(h.at, locale, true)} · {t.orders.actors[h.actor ?? 'SYSTEM']}
                      </p>
                      {h.note && <p className="mt-0.5 text-sm text-muted-foreground">{h.note}</p>}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            {actions.length > 0 && (
              <Card className="fixed inset-x-0 bottom-0 z-20 gap-0 rounded-none border-x-0 border-b-0 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] md:static md:rounded-xl md:border md:py-4 md:shadow-none">
                <CardContent className="flex gap-2 px-4 md:flex-col">
                  {actions.map((a) => (
                    <Button
                      key={a}
                      variant={PRIMARY.includes(a) ? 'default' : 'outline'}
                      className={cn('flex-1 md:flex-none', !PRIMARY.includes(a) && 'text-destructive hover:text-destructive max-md:hidden')}
                      onClick={() => setAction(a)}
                    >
                      {a === 'confirm' && o.payment?.method === 'COD' ? t.orders.confirmCod : t.orders.actions[a]}
                    </Button>
                  ))}
                  {/* Phones: secondary actions behind one button to keep the bar tidy. */}
                  {actions.some((a) => !PRIMARY.includes(a)) && (
                    <SecondaryMenu actions={actions.filter((a) => !PRIMARY.includes(a))} onPick={setAction} />
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t.orders.payment}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {o.payment && (
                  <>
                    <Row label={t.orders.methods[o.payment.method]} value={t.orders.paymentStatus[o.payment.status]} />
                    {o.payment.paidAt && <p className="text-xs text-muted-foreground">{fill(t.orders.paidAt, { date: formatDate(o.payment.paidAt, locale, true) })}</p>}
                    {o.payment.hasSlip && (
                      <Button variant="outline" size="sm" className="mt-1 self-start" onClick={() => void openSlip(o.number)}>
                        <ScanSearch />
                        {t.orders.viewSlip}
                      </Button>
                    )}
                  </>
                )}
                {o.status === 'PENDING' && o.paymentDueAt && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    {fill(t.orders.payBy, { date: formatDate(o.paymentDueAt, locale, true) })}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="gap-3">
              <CardHeader>
                <CardTitle className="text-base">{t.orders.summary}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                <Row label={t.orders.subtotal} value={formatMoney(o.subtotal, locale)} />
                {o.discountTotal > 0 && <Row label={t.orders.discount} value={`−${formatMoney(o.discountTotal, locale)}`} />}
                {o.shippingFee > 0 && <Row label={t.orders.shipping} value={formatMoney(o.shippingFee, locale)} />}
                <Row label={t.orders.total} value={formatMoney(o.total, locale)} strong />
                <div className="my-1 border-t" />
                <Row label={t.orders.commission} value={`−${formatMoney(o.commissionAmount, locale)}`} muted />
                <Row label={t.orders.youReceive} value={formatMoney(net, locale)} strong />
              </CardContent>
            </Card>

            {(o.deliveryProvider || o.trackingNumber || o.autoConfirmAt) && (
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="text-base">{t.orders.delivery}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5 text-sm">
                  {o.deliveryProvider && <Row label={t.orders.courier} value={o.deliveryProvider.name} />}
                  {o.trackingNumber && <Row label={t.orders.tracking} value={<span className="font-mono">{o.trackingNumber}</span>} />}
                  {o.status === 'DELIVERED' && o.autoConfirmAt && (
                    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <Truck className="mt-0.5 size-3.5 shrink-0" />
                      {fill(t.orders.autoConfirm, { date: formatDate(o.autoConfirmAt, locale) })}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </PageBody>

      <ActionDialog order={o} action={action} onClose={() => setAction(null)} />
    </>
  )
}

function SecondaryMenu({ actions, onPick }: { actions: ShopOrderAction[]; onPick: (a: ShopOrderAction) => void }) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={t.common.more} className="md:hidden">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        {actions.map((a) => (
          <DropdownMenuItem key={a} variant="destructive" onSelect={() => onPick(a)}>
            {t.orders.actions[a]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ActionDialog({ order, action, onClose }: { order: ShopOrderDetail; action: ShopOrderAction | null; onClose: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const providers = useDeliveryProviders()
  const [reason, setReason] = useState('')
  const [providerId, setProviderId] = useState(order.deliveryProvider?.id ?? '')
  const [tracking, setTracking] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: (a: ShopOrderAction) =>
      send<ShopOrderDetail>('POST', `/me/shop/orders/${encodeURIComponent(order.number)}/actions`, {
        action: a,
        ...(reason.trim() && { reason: reason.trim() }),
        ...(a === 'ship' && providerId && { deliveryProviderId: providerId }),
        ...(a === 'ship' && tracking.trim() && { trackingNumber: tracking.trim() }),
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.order(order.number), saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary })
      toast.success(t.orders.done)
      close()
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined
      setError(code && code in t.orders.errors ? t.orders.errors[code as keyof Dict['orders']['errors']] : t.common.saveError)
    },
  })

  function close() {
    setReason('')
    setTracking('')
    setError(null)
    onClose()
  }

  if (!action) return null
  const needsReason = NEEDS_REASON.includes(action)
  const destructive = !PRIMARY.includes(action)

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (needsReason && !reason.trim()) return setError(t.orders.reasonRequired)
            run.mutate(action)
          }}
        >
          <DialogHeader>
            <DialogTitle>{action === 'confirm' && order.payment?.method === 'COD' ? t.orders.confirmCod : t.orders.actions[action]}</DialogTitle>
            <DialogDescription>{t.orders.confirmBody[action]}</DialogDescription>
          </DialogHeader>

          {action === 'ship' && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>{t.orders.courier}</Label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.orders.chooseCourier} />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.data?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tracking">
                  {t.orders.tracking} <span className="font-normal text-muted-foreground">({t.common.optional})</span>
                </Label>
                <Input id="tracking" value={tracking} maxLength={64} className="font-mono" onChange={(e) => setTracking(e.target.value)} />
              </div>
            </>
          )}

          {(needsReason || action === 'approve-return') && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reason" required={needsReason}>
                {t.orders.reason}
                {!needsReason && <span className="font-normal text-muted-foreground"> ({t.common.optional})</span>}
              </Label>
              <Textarea id="reason" rows={3} maxLength={300} value={reason} onChange={(e) => (setReason(e.target.value), setError(null))} />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant={destructive ? 'destructive' : 'default'} disabled={run.isPending}>
              {run.isPending && <LoaderCircle className="animate-spin" />}
              {action === 'confirm' && order.payment?.method === 'COD' ? t.orders.confirmCod : t.orders.actions[action]}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, value, strong, muted }: { label: string; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between gap-3', strong && 'font-semibold', muted && 'text-muted-foreground')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

function Notice({ tone, icon: Icon, children }: { tone: 'warn' | 'danger' | 'muted'; icon: typeof Clock3; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl border p-3 text-sm',
        tone === 'warn' && 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100',
        tone === 'danger' && 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

function formatAddress(a: NonNullable<ShopOrderDetail['shippingAddress']>, locale: Locale): string {
  return [a.line, a.village, a.district, provinceName(a.province, locale)].filter(Boolean).join(', ')
}

/** The slip is private: fetch it with the session and open it in a new tab. */
async function openSlip(number: string) {
  const tab = window.open('', '_blank')
  const res = await fetch(`${import.meta.env.VITE_API_URL}/me/shop/orders/${encodeURIComponent(number)}/slip`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok || !tab) return tab?.close()
  tab.location.href = URL.createObjectURL(await res.blob())
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** A plain printable packing slip in its own window (works with any printer or "Save as PDF"). */
function printPackingSlip(o: ShopOrderDetail, shopName: string, t: Dict, locale: Locale) {
  const w = window.open('', '_blank', 'width=720,height=900')
  if (!w) return
  const a = o.shippingAddress
  const rows = o.items
    .map((i) => `<tr><td>${esc(i.name)}${i.variant ? `<br><small>${esc(i.variant)}</small>` : ''}</td><td>${esc(i.sku)}</td><td class="n">${i.quantity}</td></tr>`)
    .join('')
  w.document.write(`<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${esc(t.orders.packingSlip)} ${esc(o.number)}</title>
<style>body{font-family:system-ui,'Noto Sans Lao',sans-serif;margin:32px;color:#111}h1{font-size:20px;margin:0}small{color:#555}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}
.box{border:1px solid #ccc;border-radius:8px;padding:12px;margin-bottom:16px}table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd;vertical-align:top}.n{text-align:right}.big{font-size:18px;font-weight:600}</style></head>
<body><div class="top"><div><h1>${esc(shopName)}</h1><small>${esc(t.orders.packingSlip)}</small></div>
<div style="text-align:right"><div class="big">${esc(o.number)}</div><small>${esc(formatDate(o.createdAt, locale, true))}</small></div></div>
<div class="box"><small>${esc(t.orders.shipTo)}</small><div class="big">${esc(a?.recipientName ?? o.customer.name)}</div>
<div>${esc(formatPhone(a?.phone ?? o.customer.phone ?? ''))}</div>${a ? `<div>${esc(formatAddress(a, locale))}</div>` : ''}</div>
${o.note ? `<div class="box"><small>${esc(t.orders.note)}</small><div>${esc(o.note)}</div></div>` : ''}
<table><thead><tr><th>${esc(t.products.product)}</th><th>SKU</th><th class="n">#</th></tr></thead><tbody>${rows}</tbody></table>
<p style="margin-top:16px"><small>${esc(o.payment ? t.orders.methods[o.payment.method] : '')}${o.payment?.method === 'COD' ? ` · ${esc(t.orders.total)}: ${esc(formatMoney(o.total, locale))}` : ''}</small></p>
<script>window.onload=()=>{window.print()}</script></body></html>`)
  w.document.close()
}

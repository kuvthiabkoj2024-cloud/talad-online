import { formatPhone, provinceName, type Locale, type ShopOrderAction } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@talad/ui/components/dropdown-menu'
import { Label } from '@talad/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, ChevronDown, CircleCheckBig, Clock3, ImageOff, Images, LoaderCircle, MapPin, MoreHorizontal, PackageCheck, Phone, Printer, ReceiptText, Tag, TriangleAlert, Store, Truck, UserRound, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { toast } from 'sonner'
import { PageBody, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { OrderStatusBadge } from '@/components/status-badge'
import { queryKeys, useDeliveryProviders, useMyShop, useShopProfile } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, getToken, send, upload } from '@/lib/api'
import { fill, formatDate, formatMoney } from '@/lib/format'
import { billHtml, printHtml, stickerHtml } from '@/lib/print-order'
import type { ShopOrderDetail } from '@/lib/types'

/** The main next step first; destructive ones last. */
const PRIMARY: ShopOrderAction[] = ['ship', 'approve-return']
/**
 * A paid order has two ways forward: pack & ship (with the courier's bill) or out of stock.
 * The older separate pack step isn't offered any more.
 */
const HIDDEN: ShopOrderAction[] = ['pack']
/** Stays on the phone action bar next to the main step (it's the other way forward). */
const ALWAYS_SHOWN: ShopOrderAction[] = ['out-of-stock']
const NEEDS_REASON: ShopOrderAction[] = ['cancel', 'reject-return']

/** One order: what to send where, payment, and the next fulfilment step (§3.6). */
export function OrderDetailPage() {
  const { number = '' } = useParams()
  const { t, locale } = useI18n()
  const order = useQuery({
    queryKey: queryKeys.order(number),
    queryFn: () => api<ShopOrderDetail>(`/me/shop/orders/${encodeURIComponent(number)}`),
  })
  const shop = useMyShop()
  const profile = useShopProfile()
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
  const actions = o.actions
    .filter((a) => !HIDDEN.includes(a))
    .sort((a, b) => Number(PRIMARY.includes(b)) - Number(PRIMARY.includes(a)))
  // The shop's next step, shown on top of the timeline (a rejected return waits on Taladonline).
  const next =
    o.status === 'CONFIRMED' || o.status === 'PACKED'
      ? t.orders.next.ship
      : o.status === 'SHIPPED' || o.status === 'DELIVERED'
        ? t.orders.next.confirm
        : o.status === 'RETURN_REQUESTED' && !o.dispute
          ? t.orders.next.return
          : null
  // A platform coupon is Taladonline's discount: it's paid back to the shop.
  const net = o.total + o.platformDiscount - o.commissionAmount
  // Printed on bills and stickers: the profile has the address, the shop the logo and contacts.
  const printShop = {
    name: profile.data?.name ?? shop.data?.name ?? '',
    logoUrl: profile.data?.logoUrl ?? shop.data?.logoUrl ?? null,
    phone: profile.data?.phone ?? shop.data?.phone ?? '',
    email: profile.data?.email ?? shop.data?.email ?? '',
    address: profile.data?.address ?? null,
  }
  const address = o.shippingAddress

  return (
    <>
      <TopBar title={o.number} backTo="/orders" />
      <PageBody className="pb-28 md:pb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-mono text-xl font-semibold md:text-2xl">{o.number}</h2>
              <OrderStatusBadge status={o.status} />
            </div>
            <p className="text-sm text-muted-foreground">{fill(t.orders.placed, { date: formatDate(o.createdAt, locale, true) })}</p>
          </div>
          {/* Print: the A4 bill, or the 100 × 150 mm sticker for the parcel. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Printer />
                {t.print.button}
                <ChevronDown className="opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem className="items-start gap-3 py-2" onSelect={() => printHtml(billHtml(o, printShop, t, locale))}>
                <ReceiptText className="mt-0.5 size-5 text-primary" />
                <span>
                  <span className="block font-medium">{t.print.bill}</span>
                  <span className="block text-xs text-muted-foreground">{t.print.billHint}</span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem className="items-start gap-3 py-2" onSelect={() => printHtml(stickerHtml(o, printShop, t, locale))}>
                <Tag className="mt-0.5 size-5 text-primary" />
                <span>
                  <span className="block font-medium">{t.print.sticker}</span>
                  <span className="block text-xs text-muted-foreground">{t.print.stickerHint}</span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {o.status !== 'CANCELLED' && o.status !== 'PENDING' && <OrderSteps order={o} />}

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
                  {/* What the shop does next (amber, in progress) above what already happened (green). */}
                  {next && (
                    <li className="relative">
                      <span aria-hidden className="absolute top-0 -left-[30px] flex size-5 items-center justify-center rounded-full bg-amber-400 text-white ring-4 ring-card">
                        <LoaderCircle className="size-3 animate-[spin_2s_linear_infinite]" strokeWidth={3} />
                      </span>
                      <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{next}</p>
                      {(o.status === 'SHIPPED' || o.status === 'DELIVERED') && o.autoConfirmAt && (
                        <p className="text-xs text-muted-foreground">{fill(t.orders.autoConfirm, { date: formatDate(o.autoConfirmAt, locale) })}</p>
                      )}
                    </li>
                  )}
                  {[...o.history].reverse().map((h, i) => (
                    <li key={i} className="relative">
                      <span aria-hidden className="absolute top-0 -left-[30px] flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-card">
                        <Check className="size-3" strokeWidth={3.5} />
                      </span>
                      <p className="text-sm font-medium">{h.status === 'PENDING' ? t.orders.placedStep : t.orders.status[h.status]}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(h.at, locale, true)} · {t.orders.actors[h.actor ?? 'SYSTEM']}
                      </p>
                      {h.note && <p className="mt-0.5 text-sm text-muted-foreground">{noteText(h.note, t.orders.notes)}</p>}
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
                      className={cn(
                        'flex-1 md:flex-none',
                        !PRIMARY.includes(a) && 'text-destructive hover:text-destructive',
                        !PRIMARY.includes(a) && !ALWAYS_SHOWN.includes(a) && 'max-md:hidden',
                      )}
                      onClick={() => setAction(a)}
                    >
                      {a === 'ship' && o.pickup ? t.orders.readyForPickup : t.orders.actions[a]}
                    </Button>
                  ))}
                  {/* Phones: secondary actions behind one button to keep the bar tidy. */}
                  {actions.some((a) => !PRIMARY.includes(a) && !ALWAYS_SHOWN.includes(a)) && (
                    <SecondaryMenu actions={actions.filter((a) => !PRIMARY.includes(a) && !ALWAYS_SHOWN.includes(a))} onPick={setAction} />
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
                {o.platformDiscount > 0 && <Row label={t.orders.platformCoupon} value={`+${formatMoney(o.platformDiscount, locale)}`} muted />}
                <Row label={t.orders.commission} value={`−${formatMoney(o.commissionAmount, locale)}`} muted />
                <Row label={t.orders.youReceive} value={formatMoney(net, locale)} strong />
              </CardContent>
            </Card>

            {(o.deliveryProvider || o.trackingNumber || o.autoConfirmAt || o.hasShippingBill || o.urgentDelivery || o.pickup) && (
              <Card className="gap-3">
                <CardHeader>
                  <CardTitle className="text-base">{t.orders.delivery}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5 text-sm">
                  {o.urgentDelivery && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-200">
                      <Zap className="size-4 shrink-0" />
                      {fill(t.orders.urgentBody, { fee: formatMoney(o.shippingFee, locale) })}
                    </p>
                  )}
                  {o.pickup && (
                    <p className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
                      <Store className="size-4 shrink-0" />
                      {t.orders.pickupBody}
                    </p>
                  )}
                  {o.deliveryProvider && <Row label={t.orders.courier} value={o.deliveryProvider.name} />}
                  {o.trackingNumber && <Row label={t.orders.tracking} value={<span className="font-mono">{o.trackingNumber}</span>} />}
                  {o.hasShippingBill && <ShippingBill number={o.number} label={t.orders.viewBill} />}
                  {(o.status === 'SHIPPED' || o.status === 'DELIVERED') && o.autoConfirmAt && (
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
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const providers = useDeliveryProviders()
  const [reason, setReason] = useState('')
  const [providerId, setProviderId] = useState(order.deliveryProvider?.id ?? '')
  const cameraInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)
  const [bill, setBill] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const billPreview = useMemo(() => (bill ? URL.createObjectURL(bill) : null), [bill])
  useEffect(() => () => void (billPreview && URL.revokeObjectURL(billPreview)), [billPreview])

  const run = useMutation({
    mutationFn: async (a: ShopOrderAction) => {
      // Shipping uploads the courier's bill first, then ships with its key.
      const billKey =
        a === 'ship' && bill ? (await upload<{ billKey: string }>(`/me/shop/orders/${encodeURIComponent(order.number)}/bill`, bill)).billKey : undefined
      return send<ShopOrderDetail>('POST', `/me/shop/orders/${encodeURIComponent(order.number)}/actions`, {
        action: a,
        ...(reason.trim() && { reason: reason.trim() }),
        ...(a === 'ship' && providerId && { deliveryProviderId: providerId }),
        ...(billKey && { billKey }),
      })
    },
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

  function pickBill(e: React.ChangeEvent<HTMLInputElement>) {
    setBill(e.target.files?.[0] ?? null)
    setError(null)
    e.target.value = ''
  }

  function close() {
    setReason('')
    setBill(null)
    setError(null)
    onClose()
  }

  if (!action) return null
  const needsReason = NEEDS_REASON.includes(action)
  const destructive = !PRIMARY.includes(action)
  const pickupReady = action === 'ship' && order.pickup
  const shipLabel = pickupReady ? t.orders.readyForPickup : t.orders.actions[action]

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (needsReason && !reason.trim()) return setError(t.orders.reasonRequired)
            if (action === 'ship' && !bill && !order.urgentDelivery && !order.pickup) return setError(t.orders.billRequired)
            run.mutate(action)
          }}
        >
          <DialogHeader>
            <DialogTitle>{shipLabel}</DialogTitle>
            <DialogDescription>{pickupReady ? t.orders.readyForPickupBody : t.orders.confirmBody[action]}</DialogDescription>
          </DialogHeader>

          {/* Pickup has no parcel: no courier or bill to add. */}
          {action === 'ship' && !order.pickup && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label required={!order.urgentDelivery}>
                  {t.orders.bill}
                  {order.urgentDelivery && <span className="font-normal text-muted-foreground"> ({t.common.optional})</span>}
                </Label>
                {billPreview ? (
                  <div className="h-48 overflow-hidden rounded-xl border bg-muted/40 p-1">
                    <img src={billPreview} alt={t.orders.bill} className="size-full rounded-lg object-contain" />
                  </div>
                ) : (
                  <div className="flex h-24 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-muted/40 text-sm text-muted-foreground">
                    <ReceiptText className="size-7" />
                    {t.orders.addBill}
                  </div>
                )}
                {/* Phones: take the photo now, or pick one already in the gallery. */}
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => cameraInput.current?.click()}>
                    <Camera />
                    {t.orders.takePhoto}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => galleryInput.current?.click()}>
                    <Images />
                    {t.orders.fromGallery}
                  </Button>
                </div>
                <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={pickBill} />
                <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={pickBill} />
                <p className="text-xs text-muted-foreground">{billPreview ? t.orders.changeBill : t.orders.billHint}</p>
              </div>
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
            </>
          )}

          {(action === 'out-of-stock' || action === 'cancel') && order.payment && order.payment.method !== 'COD' && order.payment.status === 'PAID' && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              {fill(t.orders.refundNote, { amount: formatMoney(order.total, locale) })}
            </p>
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
              {shipLabel}
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

/** System notes are stored in English; show them in the Seller Center's language when we know them. */
function noteText(note: string, notes: Record<string, string>): string {
  if (note.startsWith('Payment slip rejected: ')) return fill(notes.slipRejected, { reason: note.slice(23) })
  if (note.startsWith('Escalated: ')) return fill(notes.escalated, { reason: note.slice(11) })
  return notes[note] ?? note
}

const STEP_ICONS = [PackageCheck, Truck, CircleCheckBig]

/**
 * Where the order is for the shop: received (paid, or cash on delivery) → delivered (shipped
 * with the courier's bill) → completed (the customer confirmed, or AUTO_COMPLETE_DAYS passed).
 * Steps reached are a green check; the next one is amber, in progress.
 */
function OrderSteps({ order: o }: { order: ShopOrderDetail }) {
  const { t, locale } = useI18n()
  // `waiting`: said while that step is the one in progress ("to ship", not "delivered").
  const steps: { label: string; waiting: string; statuses: string[] }[] = [
    { label: t.orders.steps.received, waiting: t.orders.steps.received, statuses: ['CONFIRMED', 'PACKED'] },
    {
      label: o.pickup ? t.orders.readyForPickup : t.orders.steps.delivered,
      waiting: o.pickup ? t.orders.steps.toPrepare : t.orders.steps.toShip,
      statuses: ['SHIPPED', 'DELIVERED', 'RETURN_REQUESTED'],
    },
    { label: t.orders.steps.completed, waiting: t.orders.steps.toConfirm, statuses: ['COMPLETED'] },
  ]
  const reached = steps.findIndex((s) => s.statuses.includes(o.status))
  // When each step was reached (the latest history entry into it).
  const at = (i: number) => [...o.history].reverse().find((h) => steps[i].statuses.includes(h.status))?.at
  return (
    <Card className="py-4">
      <CardContent className="px-4">
        <ol className="grid grid-cols-3">
          {steps.map((step, i) => {
            // Reached: green check. Next: amber, in progress. A return request waits on Taladonline.
            const done = i <= reached
            const progressing = i === reached + 1 && o.status !== 'RETURN_REQUESTED'
            const Icon = STEP_ICONS[i]
            const when = done ? at(i) : undefined
            return (
              <li key={step.label} className="relative flex flex-col items-center gap-1.5 text-center">
                {i > 0 && (
                  <span aria-hidden className={cn('absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2', done ? 'bg-primary' : progressing ? 'bg-amber-400' : 'bg-border')} />
                )}
                <span
                  className={cn(
                    'relative z-10 flex size-8 items-center justify-center rounded-full ring-4 ring-card',
                    done ? 'bg-primary text-primary-foreground' : progressing ? 'bg-amber-400 text-white' : 'bg-muted text-muted-foreground/60',
                  )}
                >
                  {done ? (
                    <Check className="size-4" strokeWidth={3} />
                  ) : progressing ? (
                    <LoaderCircle className="size-4 animate-[spin_2s_linear_infinite]" strokeWidth={2.5} />
                  ) : (
                    <Icon className="size-4" />
                  )}
                </span>
                <span className={cn('text-xs sm:text-sm', done ? 'font-medium' : progressing ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
                  {progressing ? step.waiting : step.label}
                </span>
                {when && <span className="text-[11px] text-muted-foreground">{formatDate(when, locale)}</span>}
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}

/**
 * The courier bill photo uploaded when shipping: a thumbnail on the order, full size in a
 * pop-up. It's private, so it's fetched with the session.
 */
function ShippingBill({ number, label }: { number: string; label: string }) {
  const [open, setOpen] = useState(false)
  const bill = useQuery({
    queryKey: [...queryKeys.orders, number, 'bill'],
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/me/shop/orders/${encodeURIComponent(number)}/bill`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      if (!res.ok) throw new Error(String(res.status))
      return URL.createObjectURL(await res.blob())
    },
  })
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex items-center gap-3 rounded-lg p-1.5 text-left ring-1 ring-border transition hover:bg-muted hover:ring-primary/40"
      >
        <span className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {bill.isPending ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
          ) : bill.data ? (
            <img src={bill.data} alt="" className="size-full object-cover" />
          ) : (
            <ImageOff className="size-4 text-muted-foreground" />
          )}
        </span>
        <span className="flex items-center gap-1.5 font-medium text-primary">
          <ReceiptText className="size-4" />
          {label}
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          {bill.data && <img src={bill.data} alt={label} className="max-h-[75vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  )
}

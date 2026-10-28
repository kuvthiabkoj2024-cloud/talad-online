import { LAO_BANKS, type BankCode } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { cn } from '@talad/ui/lib/utils'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Download, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { PayoutStatusBadge } from '@/components/badges'
import { ErrorState, LoadingState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import { api, getToken } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber } from '@/lib/format'
import { usePrivateImage } from '@/lib/private-file'
import { PAYOUT_NEXT, type PayoutAction } from '@/lib/payouts'
import type { PayoutDetail } from '@/lib/types'


/** Where to send a payout (bank account and the shop's QR) and the orders it settles. */
export function PayoutDetailDialog({
  id,
  onClose,
  onAct,
}: {
  id: string | null
  onClose: () => void
  onAct: (id: string, shop: string, action: PayoutAction) => void
}) {
  const { t, locale } = useI18n()
  const detail = useQuery({ queryKey: ['admin', 'payouts', 'detail', id], queryFn: () => api<PayoutDetail>(`/admin/payouts/${id}`), enabled: !!id })
  const p = detail.data
  const bank = p?.shop.paymentBankCode ? (LAO_BANKS[p.shop.paymentBankCode as BankCode] ?? p.shop.paymentBankCode) : null
  const platform = p?.orders.reduce((n, o) => n + o.platformDiscount, 0) ?? 0

  return (
    <Dialog open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {p ? fill(t.payouts.detailTitle, { shop: p.shop.name }) : t.payouts.details}
            {p && <PayoutStatusBadge status={p.status} />}
          </DialogTitle>
          <DialogDescription>
            {p && (
              <>
                {formatDate(p.periodStart, locale)} – {formatDate(p.periodEnd, locale)} · {formatNumber(p.orders.length, locale)} {t.payouts.orders}
                {p.paidAt && <> · {fill(t.payouts.paidOn, { date: formatDate(p.paidAt, locale) })}</>}
                {p.reference && (
                  <>
                    {' · '}
                    <span className="font-mono">{p.reference}</span>
                  </>
                )}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {detail.isPending ? (
          <LoadingState />
        ) : detail.isError || !p ? (
          <ErrorState onRetry={() => void detail.refetch()} />
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
              {/* How much, and the bank account to send it to. */}
              <div className="flex min-w-0 flex-col gap-3">
                <div className="rounded-xl bg-primary px-4 py-3 text-primary-foreground">
                  <p className="text-xs opacity-80">{t.payouts.amountToPay}</p>
                  <p className="text-3xl font-bold tabular-nums">{formatMoney(p.net, locale)}</p>
                  <p className="mt-1 text-xs opacity-80">
                    {t.payouts.gross} {formatMoney(p.gross, locale)} · {t.payouts.commission} −{formatMoney(p.commission, locale)}
                    {platform > 0 && (
                      <>
                        {' · '}
                        {t.payouts.platformCoupons} +{formatMoney(platform, locale)}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-2 rounded-xl border p-4">
                  <p className="text-xs font-medium text-muted-foreground">{t.payouts.transferTo}</p>
                  {p.shop.paymentAccountNumber ? (
                    <>
                      <p className="font-semibold">{bank}</p>
                      <CopyRow label={t.payouts.accountName} value={p.shop.paymentAccountName ?? ''} />
                      <CopyRow label={t.payouts.accountNumber} value={p.shop.paymentAccountNumber} mono />
                      <CopyRow label={t.payouts.amountToPay} value={String(p.net)} display={formatMoney(p.net, locale)} />
                    </>
                  ) : (
                    <p className="text-sm text-destructive">{t.payouts.noBank}</p>
                  )}
                </div>
              </div>
              {/* The shop's own payment QR: scan it with the bank app instead of typing. */}
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border p-4">
                {p.shop.hasQr ? <PayoutQr id={p.id} shop={p.shop.name} /> : <p className="py-10 text-center text-sm text-muted-foreground">{t.payouts.noQr}</p>}
              </div>
            </div>

            {p.hasSlip && <PayoutSlip id={p.id} />}

            <div className="flex min-w-0 flex-col gap-2">
              <p className="text-sm font-semibold">{t.payouts.includedOrders}</p>
              <div className="max-h-72 overflow-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">{t.payouts.order}</TableHead>
                      <TableHead>{t.payouts.completed}</TableHead>
                      <TableHead className="text-right">{t.payouts.customerPaid}</TableHead>
                      <TableHead className="text-right">{t.payouts.commission}</TableHead>
                      <TableHead className="pr-4 text-right">{t.payouts.net}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {p.orders.map((o) => (
                      <TableRow key={o.number}>
                        <TableCell className="pl-4 font-mono text-xs">{o.number}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(o.completedAt, locale)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(o.total, locale)}
                          {o.platformDiscount > 0 && <span className="block text-xs text-primary">+{formatMoney(o.platformDiscount, locale)}</span>}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">−{formatMoney(o.commission, locale)}</TableCell>
                        <TableCell className="pr-4 text-right font-medium tabular-nums">{formatMoney(o.net, locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        {p && PAYOUT_NEXT[p.status].length > 0 && (
          <DialogFooter>
            {PAYOUT_NEXT[p.status].map((a) => (
              <Button
                key={a}
                variant={a === 'paid' ? 'default' : 'outline'}
                className={a === 'failed' ? 'text-destructive hover:text-destructive' : ''}
                onClick={() => onAct(p.id, p.shop.name, a)}
              >
                {t.payouts.actions[a]}
              </Button>
            ))}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CopyRow({ label, value, display, mono }: { label: string; value: string; display?: string; mono?: boolean }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className={cn('block font-medium break-all', mono && 'font-mono tracking-wide')}>{display ?? value}</span>
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="shrink-0"
        onClick={() =>
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
      >
        {copied ? <Check /> : <Copy />}
        {copied ? t.payouts.copied : t.payouts.copy}
      </Button>
    </div>
  )
}

/** Taladonline's transfer slip; tap to see it full size. */
function PayoutSlip({ id }: { id: string }) {
  const { t } = useI18n()
  const slip = usePrivateImage(`/admin/payouts/${id}/slip`)
  const [zoom, setZoom] = useState(false)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">{t.payouts.slip}</p>
      {slip.data ? (
        <button type="button" onClick={() => setZoom(true)} className="self-start overflow-hidden rounded-xl border bg-muted/40 p-1">
          <img src={slip.data} alt={t.payouts.slip} className="max-h-48 rounded-lg object-contain" />
        </button>
      ) : (
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      )}
      <Dialog open={zoom} onOpenChange={setZoom}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.payouts.slip}</DialogTitle>
            <DialogDescription className="sr-only">{t.payouts.slip}</DialogDescription>
          </DialogHeader>
          {slip.data && <img src={slip.data} alt={t.payouts.slip} className="max-h-[75svh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The private QR image, fetched with the admin token (an <img> can't send it). */
function PayoutQr({ id, shop }: { id: string; shop: string }) {
  const { t } = useI18n()
  const qr = useQuery({
    queryKey: ['admin', 'payouts', 'qr', id],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/admin/payouts/${id}/qr`, { headers: { Authorization: `Bearer ${getToken() ?? ''}` } })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return URL.createObjectURL(await res.blob())
    },
    staleTime: Infinity,
  })
  if (qr.isPending) return <LoaderCircle className="my-16 size-6 animate-spin text-muted-foreground" />
  if (!qr.data) return <p className="py-10 text-center text-sm text-muted-foreground">{t.payouts.noQr}</p>
  return (
    <>
      <img src={qr.data} alt={shop} className="aspect-square w-full max-w-52 rounded-lg bg-white object-contain p-1 ring-1 ring-border" />
      <p className="text-center text-xs text-muted-foreground">{t.payouts.scanQr}</p>
      <Button asChild size="sm" variant="outline">
        <a href={qr.data} download={`qr-${shop}.png`}>
          <Download />
          {t.payouts.downloadQr}
        </a>
      </Button>
    </>
  )
}

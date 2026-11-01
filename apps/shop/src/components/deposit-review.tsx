import { DEPOSIT_RULES, type DepositStatus } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Label } from '@talad/ui/components/label'
import { Textarea } from '@talad/ui/components/textarea'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Banknote, Check, ExternalLink, LoaderCircle, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, getToken, send } from '@/lib/api'
import { fill, formatDate, formatMoney } from '@/lib/format'
import type { ShopOrderDetail } from '@/lib/types'

const ACTIONABLE: DepositStatus[] = ['PENDING', 'REJECTED', 'RETURN_DUE']

/** The deposit paid to the shop's own account: the shop checks it, or records sending it back. */
export function DepositReview({ order }: { order: ShopOrderDetail }) {
  const { t, locale } = useI18n()
  const c = t.orders.deposit
  const queryClient = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const deposit = order.deposit
  const base = `/me/shop/orders/${encodeURIComponent(order.number)}/deposit`

  const run = useMutation({
    mutationFn: (step: { path: 'confirm' | 'returned' } | { path: 'reject'; reason: string }) =>
      send<ShopOrderDetail>('POST', `${base}/${step.path}`, 'reason' in step ? { reason: step.reason } : undefined),
    onSuccess: (saved) => {
      queryClient.setQueryData(queryKeys.order(order.number), saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders })
      toast.success(c.done)
      setRejecting(false)
      setReason('')
      setError(null)
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined
      const message = code && code in t.orders.errors ? t.orders.errors[code as keyof Dict['orders']['errors']] : t.common.saveError
      if (rejecting) setError(message)
      else toast.error(message)
    },
  })

  /** Private, so it's fetched with the session and opened as a blob. */
  async function openSlip() {
    const res = await fetch(`${import.meta.env.VITE_API_URL}${base}/slip`, { headers: { Authorization: `Bearer ${getToken()}` } })
    if (!res.ok) return toast.error(t.common.saveError)
    window.open(URL.createObjectURL(await res.blob()), '_blank', 'noopener')
  }

  if (!deposit || !ACTIONABLE.includes(deposit.status)) return null
  const amount = formatMoney(deposit.amount, locale)
  const date = deposit.dueAt ? formatDate(deposit.dueAt, locale, true) : ''

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <p className="flex items-start gap-2">
        <Banknote className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="block font-semibold">
            {c.title}: {amount}
          </span>
          {deposit.status === 'PENDING' && fill(c.checkBody, { amount, date })}
          {deposit.status === 'REJECTED' && (
            <>
              {deposit.rejectReason} · {fill(c.rejectedBody, { date })}
            </>
          )}
          {deposit.status === 'RETURN_DUE' && fill(c.returnBody, { amount })}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {deposit.status === 'PENDING' && (
          <>
            <Button size="sm" disabled={run.isPending} onClick={() => run.mutate({ path: 'confirm' })}>
              {run.isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
              {c.confirm}
            </Button>
            <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => setRejecting(true)}>
              <X />
              {c.reject}
            </Button>
          </>
        )}
        {deposit.status === 'RETURN_DUE' && (
          <Button size="sm" disabled={run.isPending} onClick={() => run.mutate({ path: 'returned' })}>
            {run.isPending ? <LoaderCircle className="animate-spin" /> : <Check />}
            {c.markReturned}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => void openSlip()}>
          <ExternalLink />
          {c.viewSlip}
        </Button>
      </div>
      <Dialog open={rejecting} onOpenChange={(open) => !open && (setRejecting(false), setError(null))}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!reason.trim()) return setError(t.orders.reasonRequired)
              run.mutate({ path: 'reject', reason: reason.trim() })
            }}
          >
            <DialogHeader>
              <DialogTitle>{c.rejectTitle}</DialogTitle>
              <DialogDescription>{c.rejectBody}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="deposit-reason" required>
                {c.reason}
              </Label>
              <Textarea id="deposit-reason" rows={3} maxLength={DEPOSIT_RULES.reasonMax} value={reason} onChange={(e) => (setReason(e.target.value), setError(null))} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRejecting(false)}>
                {t.common.cancel}
              </Button>
              <Button type="submit" variant="destructive" disabled={run.isPending}>
                {run.isPending && <LoaderCircle className="animate-spin" />}
                {c.reject}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

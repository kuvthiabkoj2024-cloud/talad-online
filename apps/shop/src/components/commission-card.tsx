import { COMMISSION_RULES, formatMoney, type Commission, type CommissionType } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { MoneyInput } from '@talad/ui/components/money-input'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, LoaderCircle, Percent } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate } from '@/lib/format'
import type { ProductCommission } from '@/lib/types'

/**
 * Taladonline's commission on this product, and a request for its own rate (§2.3): a percent,
 * or a fixed amount per unit for high-cost goods. Approved, the product pays only that.
 */
export function CommissionCard({ productId }: { productId: string }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const key = ['shop', 'product-commission', productId]
  const data = useQuery({ queryKey: key, queryFn: () => api<ProductCommission>(`/me/shop/products/${productId}/commission`) })
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<CommissionType>('PERCENT')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const label = (c: Commission) => (c.type === 'PERCENT' ? `${c.value}%` : `${formatMoney(c.value, locale)} ${t.commission.perUnit}`)

  const done = (saved: ProductCommission) => {
    queryClient.setQueryData(key, saved)
    setOpen(false)
    setValue('')
    setReason('')
    setError(null)
  }
  const request = useMutation({
    mutationFn: () => send<ProductCommission>('POST', `/me/shop/products/${productId}/commission`, { type, value: Number(value), reason: reason.trim() || undefined }),
    onSuccess: (saved) => {
      done(saved)
      toast.success(t.commission.sent)
    },
    onError: (e) => setError(e instanceof ApiError && e.code && e.code in t.commission.errors ? t.commission.errors[e.code as keyof typeof t.commission.errors] : t.common.saveError),
  })
  const cancel = useMutation({
    mutationFn: () => send<ProductCommission>('DELETE', `/me/shop/products/${productId}/commission`),
    onSuccess: (saved) => {
      done(saved)
      toast.success(t.commission.withdrawn)
    },
    onError: () => toast.error(t.common.saveError),
  })

  function submit() {
    const n = Number(value)
    const max = type === 'PERCENT' ? COMMISSION_RULES.percentMax : COMMISSION_RULES.fixedMax
    if (value.trim() === '' || !Number.isFinite(n) || n < 0 || n > max) return setError(fill(t.commission.invalid, { max: type === 'PERCENT' ? `${max}%` : formatMoney(max, locale) }))
    request.mutate()
  }

  if (!data.data) return null
  const { current, request: latest } = data.data
  const pending = latest?.status === 'PENDING'

  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Percent className="size-5 text-primary" />
          {t.commission.title}
        </CardTitle>
        <CardDescription>{t.commission.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{t.commission.current}</span>
            <span className="block text-sm text-muted-foreground">{t.commission.sources[current.source]}</span>
          </span>
          <span className="text-xl font-bold tabular-nums">{label(current.commission)}</span>
        </div>

        {latest && (
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-sm',
              pending && 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
              latest.status === 'APPROVED' && 'bg-primary/10 text-primary',
              latest.status === 'REJECTED' && 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200',
              latest.status === 'CANCELLED' && 'bg-muted text-muted-foreground',
            )}
          >
            <p className="flex items-center gap-1.5 font-medium">
              {pending && <Clock3 className="size-4" />}
              {fill(t.commission.statuses[latest.status], { rate: label(latest.requested) })}
            </p>
            <p className="text-xs opacity-80">{formatDate(latest.reviewedAt ?? latest.createdAt, locale, true)}</p>
            {latest.reviewNote && (
              <p className="mt-1">
                {t.commission.adminNote}: {latest.reviewNote}
              </p>
            )}
          </div>
        )}

        {pending ? (
          <Button type="button" variant="outline" className="self-start" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
            {cancel.isPending && <LoaderCircle className="animate-spin" />}
            {t.commission.withdraw}
          </Button>
        ) : !open ? (
          <Button type="button" variant="outline" className="self-start" onClick={() => setOpen(true)}>
            {t.commission.ask}
          </Button>
        ) : (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commission-value" required>
                {t.commission.asking}
              </Label>
              <div className="flex gap-2">
                <div role="radiogroup" aria-label={t.commission.type} className="flex shrink-0 rounded-md border p-0.5">
                  {(['PERCENT', 'FIXED'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={type === k}
                      onClick={() => (setType(k), setValue(''), setError(null))}
                      className={cn('rounded px-3 text-sm font-medium', type === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                    >
                      {k === 'PERCENT' ? '%' : '₭'}
                    </button>
                  ))}
                </div>
                {type === 'PERCENT' ? (
                  <Input id="commission-value" inputMode="decimal" value={value} onChange={(e) => (setValue(e.target.value.replace(/[^\d.]/g, '')), setError(null))} />
                ) : (
                  <MoneyInput id="commission-value" value={value} onValueChange={(v) => (setValue(v), setError(null))} />
                )}
                {type === 'FIXED' && <span className="self-center whitespace-nowrap text-sm text-muted-foreground">{t.commission.perUnit}</span>}
              </div>
              <p className="text-xs text-muted-foreground">{type === 'PERCENT' ? t.commission.percentHint : t.commission.fixedHint}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="commission-reason">
                {t.commission.reason} <span className="font-normal text-muted-foreground">({t.common.optional})</span>
              </Label>
              <Textarea id="commission-reason" rows={2} maxLength={COMMISSION_RULES.reasonMax} value={reason} placeholder={t.commission.reasonHint} onChange={(e) => setReason(e.target.value)} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => (setOpen(false), setError(null))}>
                {t.common.cancel}
              </Button>
              <Button type="button" disabled={request.isPending} onClick={submit}>
                {request.isPending && <LoaderCircle className="animate-spin" />}
                {t.commission.send}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

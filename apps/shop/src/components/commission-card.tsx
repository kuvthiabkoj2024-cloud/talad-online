import { COMMISSION_RULES, formatMoney, type Commission } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { MoneyInput } from '@talad/ui/components/money-input'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock3, LoaderCircle, Pencil, Percent } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate } from '@/lib/format'
import { askBody, askProblem, emptyAsk, type CommissionAsk } from '@/lib/commission-ask'
import type { ProductCommission } from '@/lib/types'

function useRateLabel() {
  const { t, locale } = useI18n()
  return (c: Commission) => (c.type === 'PERCENT' ? `${c.value}%` : `${formatMoney(c.value, locale)} ${t.commission.perUnit}`)
}

/** What MC Mart takes now, and where that rate comes from. */
function CurrentRate({ current }: { current: ProductCommission['current'] }) {
  const { t } = useI18n()
  const label = useRateLabel()
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{t.commission.current}</span>
        <span className="block text-sm text-muted-foreground">{t.commission.sources[current.source]}</span>
      </span>
      <span className="text-xl font-bold tabular-nums">{label(current.commission)}</span>
    </div>
  )
}

/** Rate type (% or ₭ per unit), the rate, and why. */
function AskFields({ value, onChange, error }: { value: CommissionAsk; onChange: (ask: CommissionAsk) => void; error: string | null }) {
  const { t } = useI18n()
  return (
    <>
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
                aria-checked={value.type === k}
                onClick={() => onChange({ ...value, type: k, value: '' })}
                className={cn('rounded px-3 text-sm font-medium', value.type === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
              >
                {k === 'PERCENT' ? '%' : '₭'}
              </button>
            ))}
          </div>
          {value.type === 'PERCENT' ? (
            <Input id="commission-value" inputMode="decimal" value={value.value} onChange={(e) => onChange({ ...value, value: e.target.value.replace(/[^\d.]/g, '') })} />
          ) : (
            <MoneyInput id="commission-value" value={value.value} onValueChange={(v) => onChange({ ...value, value: v })} />
          )}
          {value.type === 'FIXED' && <span className="self-center whitespace-nowrap text-sm text-muted-foreground">{t.commission.perUnit}</span>}
        </div>
        <p className="text-xs text-muted-foreground">{value.type === 'PERCENT' ? t.commission.percentHint : t.commission.fixedHint}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="commission-reason">
          {t.commission.reason} <span className="font-normal text-muted-foreground">({t.common.optional})</span>
        </Label>
        <Textarea
          id="commission-reason"
          rows={2}
          maxLength={COMMISSION_RULES.reasonMax}
          value={value.reason}
          placeholder={t.commission.reasonHint}
          onChange={(e) => onChange({ ...value, reason: e.target.value })}
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </>
  )
}

/**
 * A product not saved yet: the commission its category pays, and a request for its own rate
 * that is sent to MC Mart together with the product (draft or published).
 */
export function NewProductCommission({
  categoryId,
  value,
  onChange,
  error,
}: {
  categoryId: string
  value: CommissionAsk | null
  onChange: (ask: CommissionAsk | null) => void
  error: string | null
}) {
  const { t } = useI18n()
  const preview = useQuery({
    queryKey: ['shop', 'commission-preview', categoryId],
    queryFn: () => api<ProductCommission['current']>(`/me/shop/commission?categoryId=${categoryId}`),
    enabled: !!categoryId,
  })
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
        {preview.data ? (
          <CurrentRate current={preview.data} />
        ) : (
          !categoryId && <p className="rounded-xl border p-4 text-sm text-muted-foreground">{t.commission.pickCategory}</p>
        )}
        {value ? (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            <AskFields value={value} onChange={onChange} error={error} />
            <p className="text-xs text-muted-foreground">{t.commission.sentWithProduct}</p>
            <Button type="button" variant="outline" className="self-end" onClick={() => onChange(null)}>
              {t.commission.dontAsk}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="self-start" onClick={() => onChange(emptyAsk())}>
            {t.commission.ask}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * MC Mart's commission on this product, and a request for its own rate (§2.3): a percent,
 * or a fixed amount per unit for high-cost goods. Approved, the product pays only that.
 */
export function CommissionCard({ productId }: { productId: string }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const key = ['shop', 'product-commission', productId]
  const data = useQuery({ queryKey: key, queryFn: () => api<ProductCommission>(`/me/shop/products/${productId}/commission`) })
  // Open with what's typed in: a new request, or the waiting one being changed.
  const [ask, setAsk] = useState<CommissionAsk | null>(null)
  const [error, setError] = useState<string | null>(null)
  const label = useRateLabel()

  const done = (saved: ProductCommission) => {
    queryClient.setQueryData(key, saved)
    setAsk(null)
    setError(null)
  }
  const request = useMutation({
    mutationFn: (body: ReturnType<typeof askBody>) => send<ProductCommission>('POST', `/me/shop/products/${productId}/commission`, body),
    onSuccess: (saved) => {
      // Changing a waiting request, or sending a new one.
      const changed = data.data?.request?.status === 'PENDING'
      done(saved)
      toast.success(changed ? t.commission.updated : t.commission.sent)
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
    if (!ask) return
    const problem = askProblem(ask, t, locale)
    if (problem) return setError(problem)
    request.mutate(askBody(ask))
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
        <CurrentRate current={current} />

        {latest && !(ask && pending) && (
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
            {latest.reason && <p className="mt-1 text-xs opacity-80">{t.commission.reason}: {latest.reason}</p>}
            {latest.reviewNote && (
              <p className="mt-1">
                {t.commission.adminNote}: {latest.reviewNote}
              </p>
            )}
          </div>
        )}

        {ask ? (
          <div className="flex flex-col gap-3 rounded-xl border p-4">
            <AskFields value={ask} onChange={(v) => (setAsk(v), setError(null))} error={error} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => (setAsk(null), setError(null))}>
                {t.common.cancel}
              </Button>
              <Button type="button" disabled={request.isPending} onClick={submit}>
                {request.isPending && <LoaderCircle className="animate-spin" />}
                {pending ? t.commission.saveChange : t.commission.send}
              </Button>
            </div>
          </div>
        ) : pending ? (
          <div className="flex flex-wrap gap-2">
            {/* Still waiting: change the rate or reason, or take it back. */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setAsk({ type: latest.requested.type, value: String(latest.requested.value), reason: latest.reason ?? '' })}
            >
              <Pencil />
              {t.commission.edit}
            </Button>
            <Button type="button" variant="ghost" className="text-muted-foreground" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending && <LoaderCircle className="animate-spin" />}
              {t.commission.withdraw}
            </Button>
          </div>
        ) : (
          <Button type="button" variant="outline" className="self-start" onClick={() => setAsk(emptyAsk())}>
            {t.commission.ask}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

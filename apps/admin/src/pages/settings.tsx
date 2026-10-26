import { CHECKOUT_PAYMENT_METHODS } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { MoneyInput } from '@talad/ui/components/money-input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import type { Settings } from '@/lib/types'

const KEY = ['admin', 'settings'] as const

/** Marketplace-wide rules (§2.11). */
export function SettingsPage() {
  const { t } = useI18n()
  const settings = useQuery({ queryKey: KEY, queryFn: () => api<Settings>('/admin/settings') })
  return (
    <>
      <TopBar title={t.settings.title} />
      <PageBody>
        <PageIntro title={t.settings.title} description={t.settings.description} />
        {settings.isPending ? <LoadingState /> : settings.isError ? <ErrorState onRetry={() => void settings.refetch()} /> : <SettingsForm value={settings.data} />}
      </PageBody>
    </>
  )
}

function SettingsForm({ value }: { value: Settings }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [moderation, setModeration] = useState(value.productModeration)
  const [commission, setCommission] = useState(String(value.defaultCommissionRate))
  const [methods, setMethods] = useState(value.paymentMethods)
  const [points, setPoints] = useState({ earnPer: String(value.points.earnPer), redeemValue: String(value.points.redeemValue), expiryDays: String(value.points.expiryDays) })
  const save = useMutation({
    mutationFn: () =>
      send<Settings>('PUT', '/admin/settings', {
        productModeration: moderation,
        defaultCommissionRate: Number(commission) || 0,
        paymentMethods: methods,
        points: { earnPer: Number(points.earnPer) || 0, redeemValue: Number(points.redeemValue) || 0, expiryDays: Number(points.expiryDays) || 0 },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(KEY, saved)
      toast.success(t.settings.saved)
    },
    onError: () => toast.error(t.common.saveError),
  })
  const toggleMethod = (m: string) => setMethods((list) => (list.includes(m) ? list.filter((x) => x !== m) : [...list, m]))
  const ro = value.readOnly

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (methods.length === 0) return toast.error(t.settings.NO_PAYMENT_METHOD)
        save.mutate()
      }}
    >
      <Section title={t.settings.moderation}>
        {(['pre', 'post'] as const).map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm">
            <input type="radio" name="moderation" className="accent-(--primary)" checked={moderation === m} onChange={() => setModeration(m)} />
            {m === 'pre' ? t.settings.moderationPre : t.settings.moderationPost}
          </label>
        ))}
      </Section>
      <Section title={t.shops.commission}>
        <Field required id="commission" label={t.settings.commission} hint={t.settings.commissionHint}>
          <Input id="commission" inputMode="decimal" className="w-32" value={commission} onChange={(e) => setCommission(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
      </Section>
      <Section title={t.settings.payments} hint={t.settings.paymentsHint}>
        {CHECKOUT_PAYMENT_METHODS.map((m) => (
          <label key={m} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-(--primary)" checked={methods.includes(m)} onChange={() => toggleMethod(m)} />
            {t.orders.methods[m]}
          </label>
        ))}
      </Section>
      <Section title={t.settings.points}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field required id="earn" label={t.settings.earnPer} hint={t.settings.earnPerHint}>
            <MoneyInput id="earn" value={points.earnPer} onValueChange={(v) => setPoints((p) => ({ ...p, earnPer: v }))} />
          </Field>
          <Field required id="redeem" label={t.settings.redeemValue} hint={t.settings.redeemHint}>
            <MoneyInput id="redeem" value={points.redeemValue} onValueChange={(v) => setPoints((p) => ({ ...p, redeemValue: v }))} />
          </Field>
          <Field required id="expiry" label={t.settings.expiryDays}>
            <Input id="expiry" inputMode="numeric" value={points.expiryDays} onChange={(e) => setPoints((p) => ({ ...p, expiryDays: e.target.value.replace(/\D/g, '') }))} />
          </Field>
        </div>
      </Section>
      <Section title={t.settings.platform}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">{t.settings.currency}</dt>
          <dd>{ro.currency}</dd>
          <dt className="text-muted-foreground">{t.settings.timezone}</dt>
          <dd>{ro.timezone}</dd>
          <dt className="text-muted-foreground">{t.settings.languages}</dt>
          <dd>{ro.locales.join(', ')}</dd>
          <dt className="text-muted-foreground">{t.settings.tax}</dt>
          <dd>{ro.taxRate}%</dd>
        </dl>
      </Section>
      <Button type="submit" className="self-end" disabled={save.isPending}>
        {save.isPending && <LoaderCircle className="animate-spin" />}
        {t.common.save}
      </Button>
    </form>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">{children}</CardContent>
    </Card>
  )
}

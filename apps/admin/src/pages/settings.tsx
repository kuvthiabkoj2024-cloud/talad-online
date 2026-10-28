import { BANK_CODES, CHECKOUT_PAYMENT_METHODS, LAO_BANKS } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { MoneyInput } from '@talad/ui/components/money-input'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageOff, LoaderCircle, QrCode } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import { api, send, upload } from '@/lib/api'
import { usePrivateImage } from '@/lib/private-file'
import type { PaymentAccount, Settings } from '@/lib/types'

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
        <PaymentAccountCard />
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

const ACCOUNT_KEY = ['admin', 'payment-account'] as const

/** Taladonline's receiving account: customers transfer here at checkout; admins check the slips. */
function PaymentAccountCard() {
  const { t } = useI18n()
  const account = useQuery({ queryKey: ACCOUNT_KEY, queryFn: () => api<PaymentAccount>('/admin/settings/payment-account') })
  return (
    <Section title={t.settings.account} hint={t.settings.accountHint}>
      {account.isPending ? <LoadingState /> : account.isError ? <ErrorState onRetry={() => void account.refetch()} /> : <PaymentAccountForm value={account.data} />}
    </Section>
  )
}

function PaymentAccountForm({ value }: { value: PaymentAccount }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [bankCode, setBankCode] = useState(value.bankCode ?? '')
  const [accountName, setAccountName] = useState(value.accountName ?? '')
  const [accountNumber, setAccountNumber] = useState(value.accountNumber ?? '')
  const [qrVersion, setQrVersion] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const saved = (next: PaymentAccount) => queryClient.setQueryData(ACCOUNT_KEY, next)
  const save = useMutation({
    mutationFn: () => send<PaymentAccount>('PUT', '/admin/settings/payment-account', { bankCode: bankCode || null, accountName: accountName.trim() || null, accountNumber: accountNumber.trim() || null }),
    onSuccess: (next) => {
      saved(next)
      toast.success(t.settings.accountSaved)
    },
    onError: () => toast.error(t.common.saveError),
  })
  const uploadQr = useMutation({
    mutationFn: (file: File) => upload<PaymentAccount>('/admin/settings/payment-account/qr', file),
    onSuccess: (next) => {
      saved(next)
      setQrVersion((v) => v + 1)
    },
    onError: () => toast.error(t.common.saveError),
  })
  const removeQr = useMutation({ mutationFn: () => send<PaymentAccount>('DELETE', '/admin/settings/payment-account/qr'), onSuccess: saved })
  const hasQr = queryClient.getQueryData<PaymentAccount>(ACCOUNT_KEY)?.hasQr ?? value.hasQr

  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      <div className="flex flex-col items-center gap-2">
        <span className="flex size-40 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border">
          {hasQr ? <AccountQr version={qrVersion} /> : <QrCode className="size-10 text-muted-foreground" />}
        </span>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadQr.mutate(file)
            e.target.value = ''
          }}
        />
        <div className="flex gap-1">
          <Button type="button" variant="outline" size="sm" disabled={uploadQr.isPending} onClick={() => fileInput.current?.click()}>
            {uploadQr.isPending && <LoaderCircle className="animate-spin" />}
            {hasQr ? t.settings.changeQr : t.settings.uploadQr}
          </Button>
          {hasQr && (
            <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={removeQr.isPending} onClick={() => removeQr.mutate()}>
              {t.settings.removeQr}
            </Button>
          )}
        </div>
      </div>
      <form
        className="flex flex-1 flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Field id="bank" label={t.settings.bank}>
          <select id="bank" value={bankCode} onChange={(e) => setBankCode(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">{t.settings.chooseBank}</option>
            {BANK_CODES.map((c) => (
              <option key={c} value={c}>
                {LAO_BANKS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="account-name" label={t.settings.accountName}>
          <Input id="account-name" value={accountName} maxLength={120} onChange={(e) => setAccountName(e.target.value)} />
        </Field>
        <Field id="account-number" label={t.settings.accountNumber}>
          <Input id="account-number" value={accountNumber} maxLength={40} inputMode="numeric" className="font-mono" onChange={(e) => setAccountNumber(e.target.value)} />
        </Field>
        <Button type="submit" className="self-end" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" />}
          {t.settings.saveAccount}
        </Button>
      </form>
    </div>
  )
}

function AccountQr({ version }: { version: number }) {
  const qr = usePrivateImage(`/admin/settings/payment-account/qr?v=${version}`)
  if (qr.isPending) return <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
  if (!qr.data) return <ImageOff className="size-8 text-muted-foreground" />
  return <img src={qr.data} alt="" className="size-full bg-white object-contain" />
}

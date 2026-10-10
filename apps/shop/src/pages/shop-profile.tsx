import {
  BANK_CODES,
  formatPhone,
  LAO_BANKS,
  SHOP_PROFILE_RULES,
  SHOP_RULES,
  SOCIAL_LINKS,
  WEEKDAYS,
  type BusinessHours,
  type SocialLink,
} from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Switch } from '@talad/ui/components/switch'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, ExternalLink, ImagePlus, LoaderCircle, QrCode, Store, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { ME_KEY } from '@/auth/context'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { queryKeys, useShopProfile } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, getToken, send, upload } from '@/lib/api'
import { fill, storefrontUrl } from '@/lib/format'
import type { ShopProfile } from '@/lib/types'

type ErrorKey = keyof Dict['profile']['errors']
type Kind = 'logo' | 'cover' | 'payment-qr'

const errorText = (e: unknown, t: Dict) =>
  e instanceof ApiError && e.code && e.code in t.profile.errors ? t.profile.errors[e.code as ErrorKey] : t.common.saveError

/** Shop profile (§3.2), bank-transfer details (§6) and order deadlines (§3.6). */
export function ShopProfilePage() {
  const { t } = useI18n()
  const profile = useShopProfile()
  return (
    <>
      <TopBar title={t.profile.title} backTo="/" />
      {profile.isPending ? (
        <LoadingState />
      ) : profile.isError ? (
        <PageBody>
          <ErrorState onRetry={() => void profile.refetch()} />
        </PageBody>
      ) : (
        <ProfileForm key={profile.data.id} profile={profile.data} />
      )}
    </>
  )
}

function ProfileForm({ profile: p }: { profile: ShopProfile }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [name, setName] = useState(p.name)
  const [description, setDescription] = useState(p.description ?? '')
  const [email, setEmail] = useState(p.email)
  const [phone, setPhone] = useState(formatPhone(p.phone))
  const [address, setAddress] = useState(p.address ?? '')
  const [hours, setHours] = useState<BusinessHours>(p.businessHours)
  const [links, setLinks] = useState<Partial<Record<SocialLink, string>>>(p.socialLinks)
  const [bank, setBank] = useState(p.payment.bankCode ?? '')
  const [accountName, setAccountName] = useState(p.payment.accountName ?? '')
  const [accountNumber, setAccountNumber] = useState(p.payment.accountNumber ?? '')
  const [paymentWindow, setPaymentWindow] = useState(String(p.paymentWindowHrs))
  const [autoConfirm, setAutoConfirm] = useState(String(p.autoConfirmHrs))
  const { paymentWindowHrs: pw, autoConfirmHrs: ac } = SHOP_PROFILE_RULES

  const refresh = (saved: ShopProfile) => {
    queryClient.setQueryData(queryKeys.profile, saved)
    void queryClient.invalidateQueries({ queryKey: queryKeys.shop })
    void queryClient.invalidateQueries({ queryKey: ME_KEY })
  }

  const save = useMutation({
    mutationFn: () =>
      send<ShopProfile>('PUT', '/me/shop/profile', {
        name: name.trim(),
        description: description.trim() || undefined,
        email: email.trim(),
        phone,
        address: address.trim(),
        businessHours: hours,
        socialLinks: links,
        paymentBankCode: bank || null,
        paymentAccountName: accountName.trim() || null,
        paymentAccountNumber: accountNumber.trim() || null,
        paymentWindowHrs: Number(paymentWindow),
        autoConfirmHrs: Number(autoConfirm),
      }),
    onSuccess: (saved) => {
      refresh(saved)
      toast.success(t.profile.saved)
    },
    onError: (e) => toast.error(errorText(e, t)),
  })

  const approved = p.status === 'APPROVED'
  return (
    <PageBody className="max-w-4xl pb-28 md:pb-24">
      <PageIntro
        title={t.profile.title}
        description={t.profile.description}
        actions={
          approved && (
            <Button asChild variant="outline">
              <a href={storefrontUrl.shop(locale, p.slug)} target="_blank" rel="noreferrer">
                {t.profile.viewShop}
                <ExternalLink />
              </a>
            </Button>
          )
        }
      />

      <form
        id="profile-form"
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>{t.profile.images}</CardTitle>
            <CardDescription>{t.profile.imageHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row">
            <ImageSlot kind="logo" label={t.profile.logo} url={p.logoUrl} onSaved={refresh} className="size-28 rounded-full" />
            <ImageSlot kind="cover" label={t.profile.cover} url={p.coverUrl} onSaved={refresh} className="aspect-[3/1] w-full" wide />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <CardTitle>{t.profile.basics}</CardTitle>
            {p.verifiedAt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-primary">
                <BadgeCheck className="size-3.5" />
                {t.profile.verified}
              </span>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Field id="name" label={t.profile.name} required>
              <Input id="name" value={name} minLength={SHOP_RULES.nameMin} maxLength={SHOP_RULES.nameMax} required onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field id="web" label={t.profile.web}>
              <Input id="web" value={`taladonline.com/s/${p.slug}`} readOnly className="bg-muted text-muted-foreground" />
            </Field>
            <Field id="about" label={t.profile.about} hint={t.common.optional}>
              <Textarea id="about" rows={4} maxLength={SHOP_RULES.descriptionMax} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.profile.contact}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="email" label={t.profile.email} required>
                <Input id="email" type="email" value={email} required onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field id="phone" label={t.profile.phone} required>
                <Input id="phone" type="tel" value={phone} required onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
            <Field id="address" required label={t.profile.address} hint={t.profile.addressHint}>
              <Textarea id="address" rows={2} minLength={5} maxLength={SHOP_RULES.addressMax} required value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.profile.hours}</CardTitle>
            <CardDescription>{t.profile.hoursHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {WEEKDAYS.map((day) => {
              const h = hours[day]
              return (
                <div key={day} className="flex flex-wrap items-center gap-3 py-2">
                  <label className="flex w-36 items-center gap-2 text-sm">
                    <Switch
                      checked={!!h}
                      onCheckedChange={(on) =>
                        setHours((all) => {
                          const next = { ...all }
                          if (on) next[day] = { open: '08:00', close: '18:00' }
                          else delete next[day]
                          return next
                        })
                      }
                    />
                    {t.profile.days[day]}
                  </label>
                  {h ? (
                    <span className="flex items-center gap-2">
                      <Input type="time" value={h.open} className="h-8 w-28" aria-label={`${t.profile.days[day]} open`} onChange={(e) => setHours((all) => ({ ...all, [day]: { ...h, open: e.target.value } }))} />
                      –
                      <Input type="time" value={h.close} className="h-8 w-28" aria-label={`${t.profile.days[day]} close`} onChange={(e) => setHours((all) => ({ ...all, [day]: { ...h, close: e.target.value } }))} />
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t.profile.closed}</span>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.profile.social}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {SOCIAL_LINKS.map((k) => (
              <Field key={k} id={`social-${k}`} label={t.profile.socialNames[k]} hint={t.common.optional}>
                <Input id={`social-${k}`} maxLength={200} value={links[k] ?? ''} onChange={(e) => setLinks((l) => ({ ...l, [k]: e.target.value }))} />
              </Field>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.profile.payment}</CardTitle>
            <CardDescription>{t.profile.paymentHint}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 sm:flex-row">
            <div className="grid flex-1 gap-4">
              <Field id="bank" label={t.profile.bank}>
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger id="bank" className="w-full">
                    <SelectValue placeholder={t.profile.chooseBank} />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {LAO_BANKS[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="accountName" label={t.profile.accountName}>
                <Input id="accountName" maxLength={100} value={accountName} onChange={(e) => setAccountName(e.target.value)} />
              </Field>
              <Field id="accountNumber" label={t.profile.accountNumber}>
                <Input id="accountNumber" inputMode="numeric" className="font-mono" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </Field>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t.profile.qr}</Label>
              <ImageSlot kind="payment-qr" label={t.profile.qr} url={p.payment.hasQr ? 'private' : null} onSaved={refresh} className="size-40 rounded-xl" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.profile.deadlines}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field id="pw" required label={t.profile.paymentWindow} hint={fill(t.profile.paymentWindowHint, pw)}>
              <Input id="pw" type="number" min={pw.min} max={pw.max} required value={paymentWindow} onChange={(e) => setPaymentWindow(e.target.value)} />
            </Field>
            <Field id="ac" required label={t.profile.autoConfirm} hint={fill(t.profile.autoConfirmHint, ac)}>
              <Input id="ac" type="number" min={ac.min} max={ac.max} required value={autoConfirm} onChange={(e) => setAutoConfirm(e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur md:sticky md:px-6">
        <div className="mx-auto flex max-w-4xl justify-end">
          <Button type="submit" form="profile-form" className="w-full sm:w-auto" disabled={save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            {t.profile.save}
          </Button>
        </div>
      </div>
    </PageBody>
  )
}

/** Upload / replace / remove one profile image right away (it isn't part of the form save). */
function ImageSlot({
  kind,
  label,
  url,
  onSaved,
  className,
  wide,
}: {
  kind: Kind
  label: string
  /** 'private' = exists but must be fetched with the session (payment QR). */
  url: string | null
  onSaved: (p: ShopProfile) => void
  className?: string
  /** Fill the remaining row width (cover photo). */
  wide?: boolean
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const saved = await upload<ShopProfile>(`/me/shop/profile/${kind}`, file)
      setPreview(URL.createObjectURL(file))
      onSaved(saved)
    } catch (e) {
      toast.error(errorText(e, t))
    } finally {
      setBusy(false)
    }
  }

  const remove = useMutation({
    mutationFn: () => send<ShopProfile>('DELETE', `/me/shop/profile/${kind}`),
    onSuccess: (saved) => {
      setPreview(null)
      onSaved(saved)
    },
    onError: () => toast.error(t.common.saveError),
  })

  // The payment QR is private; load it with the session to show it.
  const qr = useQrPreview(kind === 'payment-qr' && url === 'private' && !preview)
  const shown = preview ?? (url === 'private' ? qr : url)
  const Icon = kind === 'payment-qr' ? QrCode : kind === 'logo' ? Store : ImagePlus

  return (
    <div className={cn('flex flex-col items-start gap-2', wide && 'w-full sm:flex-1')}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={`${url ? t.profile.change : t.profile.upload} ${label}`}
        className={cn(
          'relative flex items-center justify-center overflow-hidden border-2 border-dashed bg-muted text-muted-foreground transition-colors hover:border-primary hover:text-primary',
          shown && 'border-solid',
          className,
        )}
      >
        {shown ? <img src={shown} alt="" className={cn('size-full', kind === 'payment-qr' ? 'object-contain bg-white' : 'object-cover')} /> : <Icon className="size-7" />}
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <LoaderCircle className="size-5 animate-spin" />
          </span>
        )}
      </button>
      <div className="flex gap-1">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {url ? t.profile.change : t.profile.upload} {kind !== 'payment-qr' && label}
        </Button>
        {url && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t.profile.remove} disabled={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 />
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

function useQrPreview(enabled: boolean): string | null {
  const qr = useQuery({
    queryKey: [...queryKeys.profile, 'payment-qr'],
    enabled,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/me/shop/profile/payment-qr`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      return res.ok ? URL.createObjectURL(await res.blob()) : null
    },
  })
  return qr.data ?? null
}

function Field({ id, label, hint, required, children }: { id: string; label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

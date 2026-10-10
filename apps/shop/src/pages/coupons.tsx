import { COUPON_RULES } from '@talad/shared'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@talad/ui/components/alert-dialog'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { Switch } from '@talad/ui/components/switch'
import { Tabs, TabsList, TabsTrigger } from '@talad/ui/components/tabs'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Copy, LoaderCircle, Pencil, Plus, Shuffle, TicketPercent, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { CouponStateBadge } from '@/components/status-badge'
import { queryKeys } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber, toLocalInput } from '@/lib/format'
import type { ShopCoupon } from '@/lib/types'

type ErrorKey = keyof Dict['coupons']['errors']

/** Shop coupon codes (§3.4): what they give, how often they can be used, and when. */
export function CouponsPage() {
  const { t } = useI18n()
  const coupons = useQuery({ queryKey: queryKeys.coupons, queryFn: () => api<ShopCoupon[]>('/me/shop/coupons') })
  const [editing, setEditing] = useState<ShopCoupon | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ShopCoupon | null>(null)

  const create = (
    <Button onClick={() => setEditing('new')}>
      <Plus />
      {t.coupons.create}
    </Button>
  )

  return (
    <>
      <TopBar title={t.coupons.title} backTo="/" />
      <PageBody>
        <PageIntro title={t.coupons.title} description={t.coupons.description} actions={create} />
        {coupons.isPending ? (
          <LoadingState />
        ) : coupons.isError ? (
          <ErrorState onRetry={() => void coupons.refetch()} />
        ) : coupons.data.length === 0 ? (
          <EmptyState icon={TicketPercent} title={t.coupons.emptyTitle} body={t.coupons.emptyBody} action={create} />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {coupons.data.map((c) => (
              <li key={c.id}>
                <CouponCard coupon={c} onEdit={() => setEditing(c)} onDelete={() => setDeleting(c)} />
              </li>
            ))}
          </ul>
        )}
      </PageBody>

      <CouponDialog coupon={editing} onClose={() => setEditing(null)} />
      <DeleteCouponDialog coupon={deleting} onClose={() => setDeleting(null)} />
    </>
  )
}

/** "15% off · up to ₭50,000" / "₭20,000 off". */
function discountText(c: Pick<ShopCoupon, 'type' | 'value' | 'maxDiscount'>, t: Dict, locale: 'lo' | 'en'): string {
  if (c.type === 'FIXED_AMOUNT') return fill(t.coupons.amountOff, { amount: formatMoney(c.value, locale) })
  const off = fill(t.coupons.percentOff, { n: c.value })
  return c.maxDiscount ? `${off} · ${fill(t.coupons.upTo, { amount: formatMoney(c.maxDiscount, locale) })}` : off
}

function CouponCard({ coupon: c, onEdit, onDelete }: { coupon: ShopCoupon; onEdit: () => void; onDelete: () => void }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => send<ShopCoupon>('PATCH', `/me/shop/coupons/${c.id}`, { isActive }),
    onSuccess: (saved) => {
      queryClient.setQueryData<ShopCoupon[]>(queryKeys.coupons, (list) => list?.map((x) => (x.id === saved.id ? saved : x)))
      void queryClient.invalidateQueries({ queryKey: queryKeys.summary })
    },
    onError: () => toast.error(t.common.saveError),
  })
  const used = c.usedCount > 0

  return (
    <Card className={cn('h-full gap-3 py-0', !c.isActive && 'opacity-75')}>
      <div className="flex items-center justify-between gap-2 border-b border-dashed bg-brand-soft/60 px-4 py-3">
        <button
          type="button"
          title={t.common.copy}
          onClick={() => void navigator.clipboard.writeText(c.code).then(() => toast.success(t.common.copied))}
          className="flex items-center gap-2 font-mono text-lg font-bold tracking-wider text-primary"
        >
          {c.code}
          <Copy className="size-3.5 opacity-60" />
        </button>
        <CouponStateBadge state={c.state} />
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 px-4 text-sm">
        <p className="text-base font-semibold">{discountText(c, t, locale)}</p>
        <p className="text-muted-foreground">
          {c.minOrderAmount ? fill(t.coupons.minSpend, { amount: formatMoney(c.minOrderAmount, locale) }) : t.coupons.noMin}
        </p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarRange className="size-4" />
          {fill(t.coupons.period, { from: formatDate(c.startsAt, locale, true), to: formatDate(c.endsAt, locale, true) })}
        </p>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="size-4" />
          {c.usageLimit
            ? fill(t.coupons.used, { used: formatNumber(c.usedCount, locale), limit: formatNumber(c.usageLimit, locale) })
            : fill(t.coupons.usedUnlimited, { used: formatNumber(c.usedCount, locale) })}
          {c.perCustomer && <> · {fill(t.coupons.oncePer, { n: c.perCustomer })}</>}
        </p>
      </CardContent>
      <div className="flex items-center justify-between border-t px-4 py-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={c.isActive} disabled={toggle.isPending} onCheckedChange={(on) => toggle.mutate(on)} />
          {t.coupons.active}
        </label>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label={t.common.edit} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.common.delete}
            title={used ? t.coupons.usedCantDelete : t.common.delete}
            disabled={used}
            className="hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </Card>
  )
}

interface CouponForm {
  code: string
  type: ShopCoupon['type']
  value: string
  maxDiscount: string
  minOrderAmount: string
  usageLimit: string
  perCustomer: string
  startsAt: string
  endsAt: string
  isActive: boolean
}

function blankForm(): CouponForm {
  const start = new Date()
  start.setSeconds(0, 0)
  const end = new Date(start.getTime() + 30 * 86_400_000)
  end.setHours(23, 59, 0, 0)
  return {
    code: '',
    type: 'PERCENTAGE',
    value: '',
    maxDiscount: '',
    minOrderAmount: '',
    usageLimit: '',
    perCustomer: '1',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(end),
    isActive: true,
  }
}

function toForm(c: ShopCoupon): CouponForm {
  const s = (n: number | null) => (n === null ? '' : String(n))
  return {
    code: c.code,
    type: c.type,
    value: String(c.value),
    maxDiscount: s(c.maxDiscount),
    minOrderAmount: s(c.minOrderAmount),
    usageLimit: s(c.usageLimit),
    perCustomer: s(c.perCustomer),
    startsAt: toLocalInput(new Date(c.startsAt)),
    endsAt: toLocalInput(new Date(c.endsAt)),
    isActive: c.isActive,
  }
}

const randomCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')

function CouponDialog({ coupon, onClose }: { coupon: ShopCoupon | 'new' | null; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Dialog open={coupon !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {coupon && <CouponFormBody key={coupon === 'new' ? 'new' : coupon.id} coupon={coupon === 'new' ? null : coupon} onDone={onClose} />}
        <DialogDescription className="sr-only">{t.coupons.description}</DialogDescription>
      </DialogContent>
    </Dialog>
  )
}

function CouponFormBody({ coupon, onDone }: { coupon: ShopCoupon | null; onDone: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CouponForm>(() => (coupon ? toForm(coupon) : blankForm()))
  const [errors, setErrors] = useState<Partial<Record<keyof CouponForm, ErrorKey>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const set = <K extends keyof CouponForm>(k: K, v: CouponForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => {
      const { [k]: _, ...rest } = e
      return rest
    })
  }
  const percent = form.type === 'PERCENTAGE'
  const opt = (s: string) => (s.trim() ? Number(s) : null)

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        maxDiscount: percent ? opt(form.maxDiscount) : null,
        minOrderAmount: opt(form.minOrderAmount),
        usageLimit: opt(form.usageLimit),
        perCustomer: opt(form.perCustomer),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        isActive: form.isActive,
      }
      return coupon ? send<ShopCoupon>('PUT', `/me/shop/coupons/${coupon.id}`, body) : send<ShopCoupon>('POST', '/me/shop/coupons', body)
    },
    onSuccess: () => {
      toast.success(t.coupons.saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop })
      onDone()
    },
    onError: (e) =>
      setServerError(e instanceof ApiError && e.code && e.code in t.coupons.errors ? t.coupons.errors[e.code as ErrorKey] : t.common.saveError),
  })

  function submit() {
    const e: typeof errors = {}
    if (!COUPON_RULES.codePattern.test(form.code.trim().toUpperCase())) e.code = 'code'
    const value = Number(form.value)
    if (!(value > 0)) e.value = 'value'
    else if (percent && value > COUPON_RULES.maxPercent) e.value = 'percent'
    for (const k of ['maxDiscount', 'minOrderAmount', 'usageLimit', 'perCustomer'] as const) {
      if (form[k].trim() && !(Number(form[k]) > 0)) e[k] = 'value'
    }
    if (!(new Date(form.endsAt) > new Date(form.startsAt))) e.endsAt = 'dates'
    setErrors(e)
    setServerError(null)
    if (Object.keys(e).length === 0) save.mutate()
  }

  const err = (k: keyof CouponForm) => errors[k] && <p className="text-sm text-destructive">{t.coupons.errors[errors[k]!]}</p>
  const invalid = (k: keyof CouponForm) => (errors[k] ? { 'aria-invalid': true as const } : {})

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{coupon ? t.coupons.editTitle : t.coupons.createTitle}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="code" required>{t.coupons.code}</Label>
        <div className="flex gap-2">
          <Input
            id="code"
            value={form.code}
            maxLength={20}
            autoCapitalize="characters"
            className="font-mono uppercase"
            onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            {...invalid('code')}
          />
          <Button type="button" variant="outline" onClick={() => set('code', randomCode())}>
            <Shuffle />
            {t.coupons.generate}
          </Button>
        </div>
        {err('code') || <p className="text-xs text-muted-foreground">{t.coupons.codeHint}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label required>{t.coupons.type}</Label>
        <Tabs value={form.type} onValueChange={(v) => set('type', v as CouponForm['type'])}>
          <TabsList className="w-full">
            <TabsTrigger value="PERCENTAGE">{t.coupons.percentage}</TabsTrigger>
            <TabsTrigger value="FIXED_AMOUNT">{t.coupons.fixed}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="value" required label={percent ? t.coupons.percentValue : t.coupons.amountValue} value={form.value} onChange={(v) => set('value', v)} error={err('value')} invalid={invalid('value')} />
        {percent && (
          <NumberField id="maxDiscount" label={t.coupons.maxDiscount} hint={t.common.optional} value={form.maxDiscount} onChange={(v) => set('maxDiscount', v)} error={err('maxDiscount')} invalid={invalid('maxDiscount')} />
        )}
        <NumberField id="minOrder" label={t.coupons.minOrder} hint={t.common.optional} value={form.minOrderAmount} onChange={(v) => set('minOrderAmount', v)} error={err('minOrderAmount')} invalid={invalid('minOrderAmount')} />
        <NumberField id="usageLimit" label={t.coupons.usageLimit} hint={t.common.unlimited} value={form.usageLimit} onChange={(v) => set('usageLimit', v)} error={err('usageLimit')} invalid={invalid('usageLimit')} />
        <NumberField id="perCustomer" label={t.coupons.perCustomer} hint={t.common.unlimited} value={form.perCustomer} onChange={(v) => set('perCustomer', v)} error={err('perCustomer')} invalid={invalid('perCustomer')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startsAt" required>{t.coupons.startsAt}</Label>
          <Input id="startsAt" type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endsAt" required>{t.coupons.endsAt}</Label>
          <Input id="endsAt" type="datetime-local" value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} {...invalid('endsAt')} />
          {err('endsAt')}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Switch checked={form.isActive} onCheckedChange={(on) => set('isActive', on)} />
        {t.coupons.active}
      </label>

      {serverError && <p role="alert" className="text-sm text-destructive">{serverError}</p>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <LoaderCircle className="animate-spin" />}
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

function NumberField({
  id,
  label,
  required,
  hint,
  value,
  onChange,
  error,
  invalid,
}: {
  id: string
  label: string
  required?: boolean
  hint?: string
  value: string
  onChange: (v: string) => void
  error?: React.ReactNode
  invalid: object
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      <Input id={id} inputMode="numeric" value={value} placeholder={hint} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} {...invalid} />
      {error}
    </div>
  )
}

function DeleteCouponDialog({ coupon, onClose }: { coupon: ShopCoupon | null; onClose: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (id: string) => send('DELETE', `/me/shop/coupons/${id}`),
    onSuccess: () => {
      toast.success(t.coupons.deleted)
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop })
      onClose()
    },
    onError: (e) => {
      toast.error(e instanceof ApiError && e.code === 'COUPON_USED' ? t.coupons.usedCantDelete : t.common.saveError)
      onClose()
    },
  })
  return (
    <AlertDialog open={coupon !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fill(t.coupons.deleteTitle, { code: coupon?.code ?? '' })}</AlertDialogTitle>
          <AlertDialogDescription>{t.coupons.deleteBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (coupon) remove.mutate(coupon.id)
            }}
          >
            {t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

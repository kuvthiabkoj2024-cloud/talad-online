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
import { MoneyInput } from '@talad/ui/components/money-input'
import { Label } from '@talad/ui/components/label'
import { Switch } from '@talad/ui/components/switch'
import { Tabs, TabsList, TabsTrigger } from '@talad/ui/components/tabs'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Copy, Layers, ListChecks, LoaderCircle, Lock, Pencil, Plus, Printer, Shuffle, TicketPercent, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { CouponStateBadge } from '@/components/status-badge'
import { queryKeys, useMyShop } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber, storefrontUrl, toLocalInput } from '@/lib/format'
import { COUPONS_PER_SHEET, couponsHtml } from '@/lib/print-coupon'
import { printHtml } from '@/lib/print-order'
import type { CouponState, ShopCoupon } from '@/lib/types'

type ErrorKey = keyof Dict['coupons']['errors']

/** Codes generated together, shown as one card. */
interface CouponBatch {
  id: string
  codes: ShopCoupon[]
}

type Entry = { kind: 'single'; coupon: ShopCoupon } | { kind: 'batch'; batch: CouponBatch }

/** What gets printed: one shared code (in copies) or a batch's codes. */
type PrintJob = { kind: 'single'; coupon: ShopCoupon } | { kind: 'batch'; batch: CouponBatch }

/** Single codes and batches, newest first. */
function entries(coupons: ShopCoupon[]): Entry[] {
  const batches = new Map<string, ShopCoupon[]>()
  const list: (Entry & { at: string })[] = []
  for (const c of coupons) {
    if (!c.batchId) list.push({ kind: 'single', coupon: c, at: c.createdAt })
    else if (batches.has(c.batchId)) batches.get(c.batchId)!.push(c)
    else batches.set(c.batchId, [c])
  }
  for (const [id, codes] of batches) {
    codes.sort((a, b) => a.code.localeCompare(b.code))
    list.push({ kind: 'batch', batch: { id, codes }, at: codes[0].createdAt })
  }
  return list.sort((a, b) => b.at.localeCompare(a.at))
}

/** Shop coupon codes (§3.4): what they give, how often they can be used, and when. */
export function CouponsPage() {
  const { t } = useI18n()
  const coupons = useQuery({ queryKey: queryKeys.coupons, queryFn: () => api<ShopCoupon[]>('/me/shop/coupons') })
  const [editing, setEditing] = useState<ShopCoupon | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ShopCoupon | null>(null)
  const [deletingBatch, setDeletingBatch] = useState<CouponBatch | null>(null)
  const [viewing, setViewing] = useState<CouponBatch | null>(null)
  const [printing, setPrinting] = useState<PrintJob | null>(null)

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
          <ul className="grid gap-3 md:grid-cols-2">
            {entries(coupons.data).map((e) =>
              e.kind === 'single' ? (
                <li key={e.coupon.id}>
                  <CouponCard
                    coupon={e.coupon}
                    onEdit={() => setEditing(e.coupon)}
                    onDelete={() => setDeleting(e.coupon)}
                    onPrint={() => setPrinting({ kind: 'single', coupon: e.coupon })}
                  />
                </li>
              ) : (
                <li key={e.batch.id}>
                  <BatchCard
                    batch={e.batch}
                    onView={() => setViewing(e.batch)}
                    onDelete={() => setDeletingBatch(e.batch)}
                    onPrint={() => setPrinting({ kind: 'batch', batch: e.batch })}
                  />
                </li>
              ),
            )}
          </ul>
        )}
      </PageBody>

      <CouponDialog coupon={editing} onClose={() => setEditing(null)} />
      <DeleteCouponDialog coupon={deleting} onClose={() => setDeleting(null)} />
      <DeleteBatchDialog batch={deletingBatch} onClose={() => setDeletingBatch(null)} />
      <BatchCodesDialog batch={viewing} onClose={() => setViewing(null)} />
      <PrintDialog job={printing} onClose={() => setPrinting(null)} />
    </>
  )
}

/** "15% off · up to ₭50,000" / "₭20,000 off". */
function discountText(c: Pick<ShopCoupon, 'type' | 'value' | 'maxDiscount'>, t: Dict, locale: 'lo' | 'en'): string {
  if (c.type === 'FIXED_AMOUNT') return fill(t.coupons.amountOff, { amount: formatMoney(c.value, locale) })
  const off = fill(t.coupons.percentOff, { n: c.value })
  return c.maxDiscount ? `${off} · ${fill(t.coupons.upTo, { amount: formatMoney(c.maxDiscount, locale) })}` : off
}

const copy = (text: string, t: Dict) => void navigator.clipboard.writeText(text).then(() => toast.success(t.common.copied))

/** Min. spend and dates, shared by single and batch cards. */
function CouponTerms({ coupon: c }: { coupon: ShopCoupon }) {
  const { t, locale } = useI18n()
  return (
    <>
      <p className="text-base font-semibold">{discountText(c, t, locale)}</p>
      <p className="text-muted-foreground">
        {c.minOrderAmount ? fill(t.coupons.minSpend, { amount: formatMoney(c.minOrderAmount, locale) }) : t.coupons.noMin}
      </p>
      <p className="flex items-center gap-1.5 text-muted-foreground">
        <CalendarRange className="size-4" />
        {fill(t.coupons.period, { from: formatDate(c.startsAt, locale, true), to: formatDate(c.endsAt, locale, true) })}
      </p>
    </>
  )
}

function CouponCard({ coupon: c, onEdit, onDelete, onPrint }: { coupon: ShopCoupon; onEdit: () => void; onDelete: () => void; onPrint: () => void }) {
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
        <button type="button" title={t.common.copy} onClick={() => copy(c.code, t)} className="flex items-center gap-2 font-mono text-lg font-bold tracking-wider text-primary">
          {c.code}
          <Copy className="size-3.5 opacity-60" />
        </button>
        <CouponStateBadge state={c.state} />
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 px-4 text-sm">
        <CouponTerms coupon={c} />
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
          <Button variant="ghost" size="icon" aria-label={t.coupons.print} title={t.coupons.print} onClick={onPrint}>
            <Printer />
          </Button>
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

/** One state for the whole batch: off if every code is off, used up if every code is. */
function batchState(codes: ShopCoupon[]): CouponState {
  const live = codes.filter((c) => c.state !== 'INACTIVE')
  if (live.length === 0) return 'INACTIVE'
  if (live.every((c) => c.state === 'USED_UP')) return 'USED_UP'
  return live.find((c) => c.state !== 'USED_UP')!.state
}

/** The prefix all of a batch's codes start with, e.g. "SALE". */
function batchPrefix(codes: ShopCoupon[]): string {
  const first = codes[0].code
  const shared = codes.reduce((n, c) => {
    let i = 0
    while (i < n && c.code[i] === first[i]) i++
    return i
  }, first.length)
  return first.slice(0, Math.max(0, Math.min(shared, first.length - COUPON_RULES.randomLength)))
}

function BatchCard({ batch, onView, onDelete, onPrint }: { batch: CouponBatch; onView: () => void; onDelete: () => void; onPrint: () => void }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const sample = batch.codes[0]
  const active = batch.codes.some((c) => c.isActive)
  const usedCodes = batch.codes.filter((c) => c.usedCount > 0).length
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => send('PATCH', `/me/shop/coupons/batch/${batch.id}`, { isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.shop }),
    onError: () => toast.error(t.common.saveError),
  })

  return (
    <Card className={cn('h-full gap-3 py-0', !active && 'opacity-75')}>
      <div className="flex items-center justify-between gap-2 border-b border-dashed bg-brand-soft/60 px-4 py-3">
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold">{fill(t.coupons.batchName, { n: formatNumber(batch.codes.length, locale) })}</span>
            <span className="block truncate font-mono text-xs tracking-wider text-primary">
              {batchPrefix(batch.codes)}
              {'•'.repeat(COUPON_RULES.randomLength)}
            </span>
          </span>
        </span>
        <CouponStateBadge state={batchState(batch.codes)} />
      </div>
      <CardContent className="flex flex-1 flex-col gap-2 px-4 text-sm">
        <CouponTerms coupon={sample} />
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="size-4" />
          {fill(t.coupons.batchUsed, { used: formatNumber(usedCodes, locale), n: formatNumber(batch.codes.length, locale) })}
          {sample.usageLimit && sample.usageLimit > 1 && <> · {fill(t.coupons.oncePer, { n: sample.usageLimit })}</>}
        </p>
      </CardContent>
      <div className="flex items-center justify-between border-t px-4 py-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={active} disabled={toggle.isPending} onCheckedChange={(on) => toggle.mutate(on)} />
          {t.coupons.active}
        </label>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={onView}>
            <ListChecks />
            {t.coupons.viewCodes}
          </Button>
          <Button variant="ghost" size="icon" aria-label={t.coupons.print} title={t.coupons.print} onClick={onPrint}>
            <Printer />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t.common.delete} className="hover:text-destructive" onClick={onDelete}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </Card>
  )
}

function BatchCodesDialog({ batch, onClose }: { batch: CouponBatch | null; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Dialog open={batch !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.coupons.codesTitle}</DialogTitle>
          <DialogDescription>{batch && fill(t.coupons.batchName, { n: batch.codes.length })}</DialogDescription>
        </DialogHeader>
        <ul className="grid grid-cols-2 gap-2">
          {batch?.codes.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                title={t.common.copy}
                onClick={() => copy(c.code, t)}
                className={cn('flex w-full flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors hover:bg-muted', c.usedCount > 0 && 'bg-muted/60')}
              >
                <span className={cn('font-mono font-semibold tracking-wider', c.usedCount > 0 ? 'text-muted-foreground line-through' : 'text-primary')}>{c.code}</span>
                <span className="text-xs text-muted-foreground">{c.usedCount > 0 ? fill(t.coupons.codeUsed, { n: c.usedCount }) : t.coupons.codeFree}</span>
              </button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => batch && copy(batch.codes.map((c) => c.code).join('\n'), t)}>
            <Copy />
            {t.common.copy}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Sheets of cut-out coupons: copies of a shared code, or a batch's codes. */
function PrintDialog({ job, onClose }: { job: PrintJob | null; onClose: () => void }) {
  return (
    <Dialog open={job !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">{job && <PrintForm key={job.kind === 'single' ? job.coupon.id : job.batch.id} job={job} onDone={onClose} />}</DialogContent>
    </Dialog>
  )
}

function PrintForm({ job, onDone }: { job: PrintJob; onDone: () => void }) {
  const { t, locale } = useI18n()
  const shop = useMyShop()
  const [copies, setCopies] = useState(String(COUPONS_PER_SHEET))
  const [onlyUnused, setOnlyUnused] = useState(true)

  const coupons =
    job.kind === 'single'
      ? Array.from({ length: Math.min(500, Math.max(0, Number(copies) || 0)) }, () => job.coupon)
      : job.batch.codes.filter((c) => !onlyUnused || c.usedCount === 0)
  const sheets = Math.ceil(coupons.length / COUPONS_PER_SHEET)

  function print() {
    const s = shop.data
    const url = s ? storefrontUrl.shop(locale, s.slug).replace(/^https?:\/\//, '') : ''
    // Close the dialog first; printing starts once it has gone (see printHtml).
    onDone()
    printHtml(couponsHtml(coupons, { name: s?.name ?? '', logoUrl: s?.logoUrl ?? null, url }, t, locale))
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.coupons.printTitle}</DialogTitle>
        <DialogDescription>{fill(t.coupons.printBody, { n: COUPONS_PER_SHEET })}</DialogDescription>
      </DialogHeader>
      {job.kind === 'single' ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="copies">{t.coupons.copies}</Label>
          <Input id="copies" inputMode="numeric" value={copies} onChange={(e) => setCopies(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={onlyUnused} onCheckedChange={setOnlyUnused} />
          {t.coupons.onlyUnused}
        </label>
      )}
      <p className="text-sm text-muted-foreground">
        {coupons.length > 0 ? fill(t.coupons.printCount, { n: coupons.length, sheets }) : t.coupons.printNothing}
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button disabled={coupons.length === 0 || shop.isPending} onClick={print}>
          <Printer />
          {t.coupons.print}
        </Button>
      </DialogFooter>
    </>
  )
}

type Mode = 'single' | 'batch'

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
  quantity: string
  prefix: string
  usesPerCode: string
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
    quantity: '20',
    prefix: '',
    usesPerCode: '1',
  }
}

function toForm(c: ShopCoupon): CouponForm {
  const s = (n: number | null) => (n === null ? '' : String(n))
  return {
    ...blankForm(),
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

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const randomCode = (length = 8) => Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => ALPHABET[b % 32]).join('')
/** Matches the API's allowance for a start "now" that is a few minutes old. */
const START_GRACE_MS = 10 * 60_000

/** Which field a server error belongs under. */
const FIELD_OF: Partial<Record<string, keyof CouponForm>> = {
  CODE_TAKEN: 'code',
  INVALID_PERCENT: 'value',
  VALUE_ABOVE_MIN: 'value',
  START_IN_PAST: 'startsAt',
  END_IN_PAST: 'endsAt',
  INVALID_DATES: 'endsAt',
  LIMIT_BELOW_USED: 'usageLimit',
}

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
  const [mode, setMode] = useState<Mode>('single')
  const [form, setForm] = useState<CouponForm>(() => (coupon ? toForm(coupon) : blankForm()))
  const [errors, setErrors] = useState<Partial<Record<keyof CouponForm, string>>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const set = <K extends keyof CouponForm>(k: K, v: CouponForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }))
    setErrors((e) => {
      const { [k]: _, ...rest } = e
      return rest
    })
  }
  const percent = form.type === 'PERCENTAGE'
  const batch = !coupon && mode === 'batch'
  // Customers have used it: what it gives is fixed (the API refuses changes too).
  const locked = (coupon?.usedCount ?? 0) > 0
  const opt = (s: string) => (s.trim() ? Number(s) : null)
  const msg = (k: ErrorKey, values: Record<string, string | number> = {}) => fill(t.coupons.errors[k], values)

  const save = useMutation({
    mutationFn: (): Promise<ShopCoupon | ShopCoupon[]> => {
      const rules = {
        type: form.type,
        value: Number(form.value),
        maxDiscount: percent ? opt(form.maxDiscount) : null,
        minOrderAmount: opt(form.minOrderAmount),
        perCustomer: opt(form.perCustomer),
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        isActive: form.isActive,
      }
      if (batch) {
        return send<ShopCoupon[]>('POST', '/me/shop/coupons/batch', {
          ...rules,
          quantity: Number(form.quantity),
          prefix: form.prefix || undefined,
          usesPerCode: Number(form.usesPerCode),
        })
      }
      const body = { ...rules, code: form.code.trim().toUpperCase(), usageLimit: opt(form.usageLimit) }
      return coupon ? send<ShopCoupon>('PUT', `/me/shop/coupons/${coupon.id}`, body) : send<ShopCoupon>('POST', '/me/shop/coupons', body)
    },
    onSuccess: (saved) => {
      toast.success(Array.isArray(saved) ? fill(t.coupons.batchCreated, { n: saved.length }) : t.coupons.saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop })
      onDone()
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined
      if (!code || !(code in t.coupons.errors)) return setServerError(t.common.saveError)
      const text = msg(code as ErrorKey, { used: String((e as ApiError).body.used ?? '') })
      const field = FIELD_OF[code]
      if (field) setErrors((x) => ({ ...x, [field]: text }))
      else setServerError(text)
    },
  })

  function submit() {
    const e: typeof errors = {}
    if (batch) {
      const n = Number(form.quantity)
      if (!(Number.isInteger(n) && n >= 2 && n <= COUPON_RULES.batchMax)) e.quantity = msg('quantity', { max: COUPON_RULES.batchMax })
      if (!COUPON_RULES.prefixPattern.test(form.prefix)) e.prefix = msg('prefix')
      if (!(Number(form.usesPerCode) >= 1)) e.usesPerCode = msg('value')
    } else if (!COUPON_RULES.codePattern.test(form.code.trim().toUpperCase())) e.code = msg('code')
    const value = Number(form.value)
    if (!(value > 0)) e.value = msg('value')
    else if (percent && value > COUPON_RULES.maxPercent) e.value = msg('percent')
    else if (!percent && form.minOrderAmount.trim() && value > Number(form.minOrderAmount)) e.value = msg('VALUE_ABOVE_MIN')
    for (const k of ['maxDiscount', 'minOrderAmount', 'usageLimit', 'perCustomer'] as const) {
      if (form[k].trim() && !(Number(form[k]) > 0)) e[k] = msg('value')
    }
    if (!batch && coupon && form.usageLimit.trim() && Number(form.usageLimit) < coupon.usedCount) {
      e.usageLimit = msg('LIMIT_BELOW_USED', { used: coupon.usedCount })
    }
    const start = new Date(form.startsAt).getTime()
    const end = new Date(form.endsAt).getTime()
    const startChanged = !coupon || start !== new Date(coupon.startsAt).getTime()
    if (Number.isNaN(start) || (startChanged && start < Date.now() - START_GRACE_MS)) e.startsAt = msg('START_IN_PAST')
    if (!(end > start)) e.endsAt = msg('dates')
    else if (end <= Date.now()) e.endsAt = msg('END_IN_PAST')
    setErrors(e)
    setServerError(null)
    if (Object.keys(e).length === 0) save.mutate()
  }

  const err = (k: keyof CouponForm) => errors[k] && <p className="text-sm text-destructive">{errors[k]}</p>
  const invalid = (k: keyof CouponForm) => (errors[k] ? { 'aria-invalid': true as const } : {})
  const sample = `${form.prefix}K7P2Q9XM`.slice(0, form.prefix.length + COUPON_RULES.randomLength)

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

      {!coupon && (
        <div className="grid grid-cols-2 gap-2">
          {(['single', 'batch'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                mode === m ? 'border-primary bg-brand-soft ring-1 ring-primary' : 'hover:bg-muted',
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {m === 'single' ? <TicketPercent className="size-4 text-primary" /> : <Layers className="size-4 text-primary" />}
                {m === 'single' ? t.coupons.modeSingle : t.coupons.modeBatch}
              </span>
              <span className="text-xs text-muted-foreground">{m === 'single' ? t.coupons.modeSingleHint : t.coupons.modeBatchHint}</span>
            </button>
          ))}
        </div>
      )}

      {locked && (
        <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          {t.coupons.lockedHint}
        </p>
      )}

      {batch ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField id="quantity" required label={t.coupons.quantity} value={form.quantity} onChange={(v) => set('quantity', v.replace(/\D/g, '').slice(0, 3))} error={err('quantity')} invalid={invalid('quantity')} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="prefix">{t.coupons.prefix}</Label>
            <Input
              id="prefix"
              value={form.prefix}
              maxLength={8}
              autoCapitalize="characters"
              placeholder={t.common.optional}
              className="font-mono uppercase"
              onChange={(e) => set('prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              {...invalid('prefix')}
            />
            {err('prefix')}
          </div>
          <NumberField id="usesPerCode" required label={t.coupons.usesPerCode} value={form.usesPerCode} onChange={(v) => set('usesPerCode', v.replace(/\D/g, '').slice(0, 4))} error={err('usesPerCode')} invalid={invalid('usesPerCode')} />
          <p className="-mt-2 text-xs text-muted-foreground sm:col-span-3">
            {fill(t.coupons.prefixHint, { sample })}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="code" required>{t.coupons.code}</Label>
          <div className="flex gap-2">
            <Input
              id="code"
              value={form.code}
              maxLength={20}
              autoCapitalize="characters"
              disabled={locked}
              className="font-mono uppercase"
              onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              {...invalid('code')}
            />
            <Button type="button" variant="outline" disabled={locked} onClick={() => set('code', randomCode())}>
              <Shuffle />
              {t.coupons.generate}
            </Button>
          </div>
          {err('code') || <p className="text-xs text-muted-foreground">{t.coupons.codeHint}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label required>{t.coupons.type}</Label>
        <Tabs value={form.type} onValueChange={(v) => !locked && set('type', v as CouponForm['type'])}>
          <TabsList className="w-full">
            <TabsTrigger value="PERCENTAGE" disabled={locked}>{t.coupons.percentage}</TabsTrigger>
            <TabsTrigger value="FIXED_AMOUNT" disabled={locked}>{t.coupons.fixed}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField id="value" required money={!percent} disabled={locked} label={percent ? t.coupons.percentValue : t.coupons.amountValue} value={form.value} onChange={(v) => set('value', v)} error={err('value')} invalid={invalid('value')} />
        {percent && (
          <NumberField id="maxDiscount" money label={t.coupons.maxDiscount} hint={t.common.optional} value={form.maxDiscount} onChange={(v) => set('maxDiscount', v)} error={err('maxDiscount')} invalid={invalid('maxDiscount')} />
        )}
        <NumberField id="minOrder" money label={t.coupons.minOrder} hint={t.common.optional} value={form.minOrderAmount} onChange={(v) => set('minOrderAmount', v)} error={err('minOrderAmount')} invalid={invalid('minOrderAmount')} />
        {!batch && (
          <NumberField id="usageLimit" label={t.coupons.usageLimit} hint={t.common.unlimited} value={form.usageLimit} onChange={(v) => set('usageLimit', v)} error={err('usageLimit')} invalid={invalid('usageLimit')} />
        )}
        <NumberField id="perCustomer" label={t.coupons.perCustomer} hint={t.common.unlimited} value={form.perCustomer} onChange={(v) => set('perCustomer', v)} error={err('perCustomer')} invalid={invalid('perCustomer')} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="startsAt" required>{t.coupons.startsAt}</Label>
          <Input id="startsAt" type="datetime-local" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} {...invalid('startsAt')} />
          {err('startsAt')}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="endsAt" required>{t.coupons.endsAt}</Label>
          <Input id="endsAt" type="datetime-local" value={form.endsAt} min={form.startsAt} onChange={(e) => set('endsAt', e.target.value)} {...invalid('endsAt')} />
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
          {batch ? fill(t.coupons.createBatch, { n: Number(form.quantity) || 0 }) : t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

function NumberField({
  id,
  label,
  required,
  disabled,
  hint,
  value,
  onChange,
  error,
  invalid,
  money = false,
}: {
  id: string
  label: string
  /** A kip amount: shown as 2,000,000 while typing. */
  money?: boolean
  required?: boolean
  disabled?: boolean
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
      {money ? (
        <MoneyInput id={id} value={value} placeholder={hint} disabled={disabled} onValueChange={onChange} {...invalid} />
      ) : (
        <Input id={id} inputMode="numeric" value={value} placeholder={hint} disabled={disabled} onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))} {...invalid} />
      )}
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

function DeleteBatchDialog({ batch, onClose }: { batch: CouponBatch | null; onClose: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const remove = useMutation({
    mutationFn: (id: string) => send<{ deleted: number; kept: number }>('DELETE', `/me/shop/coupons/batch/${id}`),
    onSuccess: ({ deleted, kept }) => {
      toast.success(fill(t.coupons.batchDeleted, { deleted }), kept > 0 ? { description: fill(t.coupons.batchKept, { kept }) } : undefined)
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop })
      onClose()
    },
    onError: () => {
      toast.error(t.common.saveError)
      onClose()
    },
  })
  return (
    <AlertDialog open={batch !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{fill(t.coupons.batchDeleteTitle, { n: batch?.codes.length ?? 0 })}</AlertDialogTitle>
          <AlertDialogDescription>{t.coupons.batchDeleteBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(e) => {
              e.preventDefault()
              if (batch) remove.mutate(batch.id)
            }}
          >
            {t.common.delete}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

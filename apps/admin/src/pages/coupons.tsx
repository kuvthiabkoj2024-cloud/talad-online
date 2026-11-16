import { COUPON_RULES } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { MoneyInput } from '@talad/ui/components/money-input'
import { Switch } from '@talad/ui/components/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talad/ui/components/table'
import { Tabs, TabsList, TabsTrigger } from '@talad/ui/components/tabs'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Download, List, Pencil, Plus, TicketPercent, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CouponStateBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatMoney, formatNumber, toLocalInput } from '@/lib/format'
import type { Coupon } from '@/lib/types'

/** A list row: one code, or a batch of single-use codes shown together. */
type Row = { kind: 'single'; coupon: Coupon } | { kind: 'batch'; id: string; codes: Coupon[] }

function toRows(coupons: Coupon[]): Row[] {
  const rows: Row[] = []
  const batches = new Map<string, Coupon[]>()
  for (const c of coupons) {
    if (!c.batchId) rows.push({ kind: 'single', coupon: c })
    else if (batches.has(c.batchId)) batches.get(c.batchId)!.push(c)
    else {
      const codes = [c]
      batches.set(c.batchId, codes)
      rows.push({ kind: 'batch', id: c.batchId, codes })
    }
  }
  return rows
}

/** The prefix all of a batch's codes share, e.g. "SALE". */
function sharedPrefix(codes: Coupon[]): string {
  let p = codes[0]?.code ?? ''
  for (const c of codes) while (!c.code.startsWith(p)) p = p.slice(0, -1)
  return p
}

const KEY = ['admin', 'coupons'] as const
type ErrorKey = keyof Dict['coupons']['errors']
const errorText = (e: unknown, t: Dict) => (e instanceof ApiError && e.code && e.code in t.coupons.errors ? t.coupons.errors[e.code as ErrorKey] : t.common.saveError)

/** Platform-wide coupon codes (§2.8). */
export function CouponsPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: () => api<Coupon[]>('/admin/coupons') })
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY })
  const toggle = useMutation({
    mutationFn: (c: Coupon) => send('PATCH', `/admin/coupons/${c.id}`, { isActive: !c.isActive }),
    onSuccess: refresh,
    onError: () => toast.error(t.common.saveError),
  })
  const toggleBatch = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => send('PATCH', `/admin/coupons/batch/${id}`, { isActive }),
    onSuccess: refresh,
    onError: () => toast.error(t.common.saveError),
  })
  const [viewing, setViewing] = useState<Coupon[] | null>(null)

  return (
    <>
      <TopBar title={t.coupons.title} />
      <PageBody>
        <PageIntro
          title={t.coupons.title}
          description={t.coupons.description}
          actions={
            <Button onClick={() => setEditing('new')}>
              <Plus />
              {t.coupons.create}
            </Button>
          }
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState icon={TicketPercent} title={t.coupons.emptyTitle} />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">{t.coupons.code}</TableHead>
                  <TableHead>{t.coupons.type}</TableHead>
                  <TableHead>{t.coupons.minOrder}</TableHead>
                  <TableHead>{t.coupons.used}</TableHead>
                  <TableHead>
                    {t.coupons.startsAt} – {t.coupons.endsAt}
                  </TableHead>
                  <TableHead>{t.common.status}</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {toRows(list.data).map((row) => {
                  if (row.kind === 'batch') {
                    const c = row.codes[0]
                    const used = row.codes.filter((x) => x.usedCount > 0).length
                    const active = row.codes.some((x) => x.isActive)
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="pl-4">
                          <span className="block font-semibold">{fill(t.coupons.batchName, { n: formatNumber(row.codes.length, locale) })}</span>
                          <span className="font-mono text-xs text-muted-foreground">{sharedPrefix(row.codes)}…</span>
                        </TableCell>
                        <TableCell>
                          {c.type === 'PERCENTAGE' ? `${c.value}%` : formatMoney(c.value, locale)}
                          {c.maxDiscount !== null && c.type === 'PERCENTAGE' && <span className="text-xs text-muted-foreground"> ≤ {formatMoney(c.maxDiscount, locale)}</span>}
                        </TableCell>
                        <TableCell className="tabular-nums">{c.minOrderAmount ? formatMoney(c.minOrderAmount, locale) : '—'}</TableCell>
                        <TableCell className="tabular-nums">{fill(t.coupons.batchUsed, { used: formatNumber(used, locale), n: formatNumber(row.codes.length, locale) })}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(c.startsAt, locale, true)} – {formatDate(c.endsAt, locale, true)}
                        </TableCell>
                        <TableCell>
                          <CouponStateBadge state={active ? c.state : 'INACTIVE'} />
                        </TableCell>
                        <TableCell className="pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Switch aria-label={t.common.active} checked={active} disabled={toggleBatch.isPending} onCheckedChange={(on) => toggleBatch.mutate({ id: row.id, isActive: on })} />
                            <Button variant="ghost" size="icon-sm" aria-label={t.coupons.viewCodes} onClick={() => setViewing(row.codes)}>
                              <List />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t.common.delete}
                              onClick={() =>
                                setConfirm({
                                  title: t.coupons.deleteBatchTitle,
                                  description: t.coupons.deleteBatchBody,
                                  confirmLabel: t.common.delete,
                                  destructive: true,
                                  errorText: (e) => errorText(e, t),
                                  onConfirm: async () => {
                                    await send('DELETE', `/admin/coupons/batch/${row.id}`)
                                    refresh()
                                  },
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  }
                  const c = row.coupon
                  return (
                  <TableRow key={c.id}>
                    <TableCell className="pl-4 font-mono font-semibold">{c.code}</TableCell>
                    <TableCell>
                      {c.type === 'PERCENTAGE' ? `${c.value}%` : formatMoney(c.value, locale)}
                      {c.maxDiscount !== null && c.type === 'PERCENTAGE' && <span className="text-xs text-muted-foreground"> ≤ {formatMoney(c.maxDiscount, locale)}</span>}
                    </TableCell>
                    <TableCell className="tabular-nums">{c.minOrderAmount ? formatMoney(c.minOrderAmount, locale) : '—'}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(c.usedCount, locale)} / {c.usageLimit ? formatNumber(c.usageLimit, locale) : t.coupons.unlimited}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(c.startsAt, locale, true)} – {formatDate(c.endsAt, locale, true)}
                    </TableCell>
                    <TableCell>
                      <CouponStateBadge state={c.state} />
                    </TableCell>
                    <TableCell className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <Switch aria-label={t.common.active} checked={c.isActive} disabled={toggle.isPending} onCheckedChange={() => toggle.mutate(c)} />
                        <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => setEditing(c)}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t.common.delete}
                          disabled={c.usedCount > 0}
                          onClick={() =>
                            setConfirm({
                              title: fill(t.coupons.deleteTitle, { code: c.code }),
                              description: t.catalog.deleteBody,
                              confirmLabel: t.common.delete,
                              destructive: true,
                              errorText: (e) => errorText(e, t),
                              onConfirm: async () => {
                                await send('DELETE', `/admin/coupons/${c.id}`)
                                refresh()
                              },
                            })
                          }
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </PageBody>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          {editing && <CouponForm key={editing === 'new' ? 'new' : editing.id} coupon={editing === 'new' ? null : editing} onDone={() => (setEditing(null), refresh())} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
      <BatchCodesDialog codes={viewing} onClose={() => setViewing(null)} />
    </>
  )
}

function BatchCodesDialog({ codes, onClose }: { codes: Coupon[] | null; onClose: () => void }) {
  const { t, locale } = useI18n()
  const list = codes ?? []
  const csv = () => {
    const text = ['code,used', ...list.map((c) => `${c.code},${c.usedCount}`)].join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `coupons-${sharedPrefix(list) || 'batch'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Dialog open={codes !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.coupons.viewCodes}</DialogTitle>
          <DialogDescription>{fill(t.coupons.batchName, { n: formatNumber(list.length, locale) })}</DialogDescription>
        </DialogHeader>
        <ul className="grid max-h-[50svh] grid-cols-2 gap-1.5 overflow-y-auto">
          {list.map((c) => (
            <li key={c.id} className={c.usedCount > 0 ? 'rounded-md bg-muted px-2 py-1 font-mono text-sm text-muted-foreground line-through' : 'rounded-md bg-muted px-2 py-1 font-mono text-sm'}>
              {c.code}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={csv}>
            <Download />
            {t.coupons.downloadCsv}
          </Button>
          <Button
            onClick={() =>
              void navigator.clipboard.writeText(list.map((c) => c.code).join('\n')).then(
                () => toast.success(t.coupons.copied),
                () => toast.error(t.common.saveError),
              )
            }
          >
            <Copy />
            {t.coupons.copyAll}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function initial(c: Coupon | null) {
  const s = (n: number | null | undefined) => (n == null ? '' : String(n))
  const start = c ? new Date(c.startsAt) : new Date()
  const end = c ? new Date(c.endsAt) : new Date(start.getTime() + 30 * 86_400_000)
  return {
    code: c?.code ?? '',
    type: c?.type ?? ('PERCENTAGE' as Coupon['type']),
    value: s(c?.value),
    maxDiscount: s(c?.maxDiscount),
    minOrderAmount: s(c?.minOrderAmount),
    usageLimit: s(c?.usageLimit),
    perCustomer: c ? s(c.perCustomer) : '1',
    startsAt: toLocalInput(start),
    endsAt: toLocalInput(end),
    isActive: c?.isActive ?? true,
    kind: 'single' as 'single' | 'batch',
    quantity: '50',
    prefix: '',
    usesPerCode: '1',
  }
}

function CouponForm({ coupon, onDone }: { coupon: Coupon | null; onDone: () => void }) {
  const { t } = useI18n()
  const [form, setForm] = useState(() => initial(coupon))
  const [error, setError] = useState<string | null>(null)
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const percent = form.type === 'PERCENTAGE'
  const batch = !coupon && form.kind === 'batch'
  const opt = (s: string) => (s.trim() ? Number(s) : null)
  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: form.code,
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
      if (!coupon && form.kind === 'batch') {
        const { code: _code, usageLimit: _limit, ...rules } = body
        return send('POST', '/admin/coupons/batch', { ...rules, quantity: Number(form.quantity), prefix: form.prefix || undefined, usesPerCode: Number(form.usesPerCode) || 1 })
      }
      return coupon ? send('PUT', `/admin/coupons/${coupon.id}`, body) : send('POST', '/admin/coupons', body)
    },
    onSuccess: () => {
      toast.success(t.common.saved)
      onDone()
    },
    onError: (e) => setError(errorText(e, t)),
  })

  function submit() {
    if (percent && Number(form.value) > COUPON_RULES.maxPercent) return setError(t.coupons.errors.INVALID_PERCENT)
    if (!(new Date(form.endsAt) > new Date(form.startsAt))) return setError(t.coupons.errors.INVALID_DATES)
    setError(null)
    save.mutate()
  }

  const num = (k: 'value' | 'maxDiscount' | 'minOrderAmount' | 'usageLimit' | 'perCustomer', label: string, required = false) => (
    <Field id={k} label={label} required={required}>
      {/* Kip amounts get thousands separators; percentages and counts stay plain. */}
      {k === 'maxDiscount' || k === 'minOrderAmount' || (k === 'value' && form.type !== 'PERCENTAGE') ? (
        <MoneyInput id={k} required={required} placeholder={required ? undefined : t.coupons.unlimited} value={form[k]} onValueChange={(v) => set(k, v)} />
      ) : (
        <Input id={k} inputMode="numeric" required={required} placeholder={required ? undefined : t.coupons.unlimited} value={form[k]} onChange={(e) => set(k, e.target.value.replace(/[^\d.]/g, ''))} />
      )}
    </Field>
  )

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <DialogHeader>
        <DialogTitle>{coupon ? `${t.common.edit} ${coupon.code}` : t.coupons.create}</DialogTitle>
        <DialogDescription>{t.coupons.description}</DialogDescription>
      </DialogHeader>
      {!coupon && (
        <Tabs value={form.kind} onValueChange={(v) => set('kind', v as 'single' | 'batch')}>
          <TabsList className="w-full">
            <TabsTrigger value="single">{t.coupons.kindSingle}</TabsTrigger>
            <TabsTrigger value="batch">{t.coupons.kindBatch}</TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      {batch ? (
        <>
          <p className="-mt-1 text-sm text-muted-foreground">{t.coupons.kindBatchHint}</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field required id="quantity" label={t.coupons.quantity}>
              <Input id="quantity" inputMode="numeric" required value={form.quantity} onChange={(e) => set('quantity', e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field id="prefix" label={t.coupons.prefix}>
              <Input id="prefix" maxLength={8} className="font-mono uppercase" value={form.prefix} onChange={(e) => set('prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            </Field>
            <Field required id="usesPerCode" label={t.coupons.usesPerCode}>
              <Input id="usesPerCode" inputMode="numeric" required value={form.usesPerCode} onChange={(e) => set('usesPerCode', e.target.value.replace(/\D/g, ''))} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t.coupons.prefixHint}</p>
        </>
      ) : (
      <Field required id="code" label={t.coupons.code}>
        <Input
          id="code"
          required
          pattern="[A-Z0-9]{3,20}"
          maxLength={20}
          className="font-mono uppercase"
          value={form.code}
          onChange={(e) => set('code', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
      </Field>
      )}
      <Tabs value={form.type} onValueChange={(v) => set('type', v as Coupon['type'])}>
        <TabsList className="w-full">
          <TabsTrigger value="PERCENTAGE">{t.coupons.percentage}</TabsTrigger>
          <TabsTrigger value="FIXED_AMOUNT">{t.coupons.fixed}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="grid gap-4 sm:grid-cols-2">
        {num('value', `${t.coupons.value} (${percent ? '%' : '₭'})`, true)}
        {percent && num('maxDiscount', t.coupons.maxDiscount)}
        {num('minOrderAmount', t.coupons.minOrder)}
        {!batch && num('usageLimit', t.coupons.usageLimit)}
        {num('perCustomer', t.coupons.perCustomer)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field required id="starts" label={t.coupons.startsAt}>
          <Input id="starts" type="datetime-local" required value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
        </Field>
        <Field required id="ends" label={t.coupons.endsAt}>
          <Input id="ends" type="datetime-local" required value={form.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={form.isActive} onCheckedChange={(on) => set('isActive', on)} />
        {t.common.active}
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t.common.cancel}
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

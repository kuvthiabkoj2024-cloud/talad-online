import {
  BROADCAST_REPEATS,
  BROADCAST_VARIABLES,
  dateFormatter,
  fillBroadcastText,
  hasBroadcastVariables,
  VIENTIANE_OFFSET_MS,
  type BroadcastAudience,
  type BroadcastChannel,
  type BroadcastRepeat,
  type BroadcastType,
} from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Textarea } from '@talad/ui/components/textarea'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, Pause, Play, RotateCw, Send, Trash2, X } from 'lucide-react'
import { useDeferredValue, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FlagBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import { api, ApiError, send } from '@/lib/api'
import { fill, formatNumber } from '@/lib/format'
import type { Broadcast } from '@/lib/types'

const KEY = ['admin', 'broadcasts'] as const
const EMPTY = { titleLo: '', bodyLo: '', titleEn: '', bodyEn: '', link: '' }
const CHANNELS: BroadcastChannel[] = ['IN_APP', 'PUSH', 'SMS']
const single = (a: BroadcastAudience) => a === 'customer' || a === 'shop'

type Target = { id: string; name: string; phone: string | null; phones?: number; status?: string }

/** `YYYY-MM-DDTHH:mm` typed as Vientiane time → the instant (whatever the admin's computer clock is). */
const fromVientiane = (value: string) => {
  const [d, t] = value.split('T')
  const [y, m, day] = d!.split('-').map(Number)
  const [h, min] = t!.split(':').map(Number)
  return new Date(Date.UTC(y!, m! - 1, day!, h!, min!) - VIENTIANE_OFFSET_MS)
}
/** SMS parts for this text: Lao is sent as Unicode, 70 characters in one SMS, 67 per part beyond. */
const smsParts = (text: string) => (text.length <= 70 ? 1 : Math.ceil(text.length / 67))

/**
 * Send notifications (§2.11): to all customers, all shops, or one customer or shop; by in-app
 * notification, push (phone app + website) and SMS (one person only); now, at a time, every day
 * or on chosen weekdays, in Vientiane time. Below, everything sent or scheduled, with pause,
 * resume and delete.
 */
export function AnnouncementsPage() {
  const { t, locale } = useI18n()
  const a = t.announcements
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: () => api<Broadcast[]>('/admin/broadcasts'), refetchInterval: 30_000 })
  const [audience, setAudience] = useState<BroadcastAudience>('customers')
  const [target, setTarget] = useState<Target | null>(null)
  const [type, setType] = useState<BroadcastType>('SYSTEM')
  const [channels, setChannels] = useState<BroadcastChannel[]>(['IN_APP', 'PUSH'])
  const [later, setLater] = useState(false)
  const [repeat, setRepeat] = useState<BroadcastRepeat>('ONCE')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [msg, setMsg] = useState(EMPTY)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const edit = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMsg((m) => ({ ...m, [k]: e.target.value }))
  // The title / message field clicked last: where "Insert" puts {name}, {phone} or {shop}.
  type TextKey = 'titleLo' | 'bodyLo' | 'titleEn' | 'bodyEn'
  const fields = useRef<Partial<Record<TextKey, HTMLInputElement | HTMLTextAreaElement | null>>>({})
  const [lastField, setLastField] = useState<TextKey>('bodyLo')
  const textField = (k: TextKey) => ({
    ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      fields.current[k] = el
    },
    value: msg[k],
    onChange: edit(k),
    onFocus: () => setLastField(k),
  })
  function insertVariable(v: string) {
    const el = fields.current[lastField]
    const value = msg[lastField]
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? start
    const token = `{${v}}`
    setMsg((m) => ({ ...m, [lastField]: value.slice(0, start) + token + value.slice(end) }))
    // Back in the field, just after what was inserted.
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(start + token.length, start + token.length)
    })
  }
  const personal = [msg.titleLo, msg.bodyLo, msg.titleEn, msg.bodyEn].some(hasBroadcastVariables)
  const sample = (text: string) => fillBroadcastText(text, a.sample)

  const vientiane = (iso: string) =>
    dateFormatter(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Vientiane' }).format(new Date(iso))

  const needsTarget = single(audience)
  const reach = useQuery({
    queryKey: ['admin', 'broadcasts', 'reach', audience, target?.id],
    queryFn: () =>
      api<{ recipients: number; phones: number; browsers: number }>(
        `/admin/broadcasts/audience-count?${new URLSearchParams({ audience, ...(target && (audience === 'shop' ? { targetShopId: target.id } : { targetCustomerId: target.id })) })}`,
      ),
    enabled: !needsTarget || !!target,
  })
  const reachText = reach.data && fill(a.reach, { recipients: formatNumber(reach.data.recipients, locale), phones: formatNumber(reach.data.phones, locale), browsers: formatNumber(reach.data.browsers, locale) })

  function chooseAudience(next: BroadcastAudience) {
    setAudience(next)
    setTarget(null)
    // SMS is for one person only.
    if (!single(next)) setChannels((c) => c.filter((x) => x !== 'SMS'))
  }
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  function submit() {
    if (![msg.titleLo, msg.bodyLo, msg.titleEn, msg.bodyEn].every((s) => s.trim())) return toast.error(a.required)
    if (needsTarget && !target) return toast.error(a.targetRequired)
    if (!channels.length) return toast.error(a.channelRequired)
    const scheduled = later || repeat !== 'ONCE'
    if (scheduled && !startAt) return toast.error(a.timeRequired)
    if (repeat === 'WEEKLY' && !weekdays.length) return toast.error(a.weekdaysRequired)
    const body = {
      audience,
      ...(target && (audience === 'shop' ? { targetShopId: target.id } : { targetCustomerId: target.id })),
      type,
      channels,
      content: { lo: { title: msg.titleLo, body: msg.bodyLo }, en: { title: msg.titleEn, body: msg.bodyEn } },
      ...(msg.link.trim() && { link: msg.link.trim() }),
      repeat,
      ...(repeat === 'WEEKLY' && { weekdays }),
      ...(scheduled && { startAt: fromVientiane(startAt).toISOString() }),
      ...(repeat !== 'ONCE' && endAt && { endAt: fromVientiane(endAt).toISOString() }),
    }
    const who = target ? target.name : a.audiences[audience]
    setConfirm({
      title: fill(a.confirmTitle, { audience: who }),
      description: [reachText && fill(a.confirmBody, { reach: reachText }), channels.includes('SMS') && a.confirmSms].filter(Boolean).join(' '),
      confirmLabel: scheduled ? a.schedule : a.send,
      onConfirm: async () => {
        // A refusal (e.g. no weekday) shows in the dialog.
        await send<Broadcast>('POST', '/admin/broadcasts', body)
        toast.success(scheduled ? a.created : a.sending)
        setMsg(EMPTY)
        void queryClient.invalidateQueries({ queryKey: KEY })
        // A "send now" finishes within seconds: show its numbers.
        if (!scheduled) setTimeout(() => void queryClient.invalidateQueries({ queryKey: KEY }), 4000)
      },
    })
  }

  async function act(b: Broadcast, action: 'pause' | 'resume' | 'delete' | 'resend') {
    const run = async () => {
      try {
        if (action === 'delete') await send('DELETE', `/admin/broadcasts/${b.id}`)
        else await send('POST', `/admin/broadcasts/${b.id}/${action}`)
        void queryClient.invalidateQueries({ queryKey: KEY })
        if (action === 'resend') {
          toast.success(a.resent)
          // It sends in the background: show its numbers once done.
          setTimeout(() => void queryClient.invalidateQueries({ queryKey: KEY }), 4000)
        }
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : t.common.saveError)
      }
    }
    if (action === 'delete') setConfirm({ title: a.delete, description: a.deleteConfirm, confirmLabel: a.delete, destructive: true, onConfirm: run })
    else if (action === 'resend') setConfirm({ title: a.resendTitle, description: a.resendBody, confirmLabel: a.resend, onConfirm: run })
    else await run()
  }

  const smsText = `${msg.titleLo}\n${msg.bodyLo}`

  return (
    <>
      <TopBar title={a.title} />
      <PageBody>
        <PageIntro title={a.title} description={a.description} />
        <div className="grid gap-5 xl:grid-cols-[1fr_26rem]">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{a.new}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-5"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                {/* Who */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field required id="audience" label={a.audience}>
                    <Select value={audience} onValueChange={(v) => chooseAudience(v as BroadcastAudience)}>
                      <SelectTrigger id="audience" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(['customers', 'sellers', 'customer', 'shop'] as const).map((k) => (
                          <SelectItem key={k} value={k}>
                            {a.audiences[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field required id="type" label={a.type}>
                    <Select value={type} onValueChange={(v) => setType(v as BroadcastType)}>
                      <SelectTrigger id="type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SYSTEM">{a.types.SYSTEM}</SelectItem>
                        <SelectItem value="PROMOTION">{a.types.PROMOTION}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                {needsTarget && <TargetPicker kind={audience === 'shop' ? 'shop' : 'customer'} value={target} onChange={setTarget} />}
                {type === 'PROMOTION' && audience !== 'sellers' && audience !== 'shop' && <p className="-mt-2 text-xs text-muted-foreground">{a.promoNote}</p>}
                {reachText && (!needsTarget || target) && <p className="-mt-2 text-xs font-medium text-primary">{reachText}</p>}

                {/* How */}
                <Field required id="channels" label={a.channels}>
                  <div className="flex flex-wrap gap-2">
                    {CHANNELS.map((c) => {
                      const off = c === 'SMS' && !needsTarget
                      const on = channels.includes(c)
                      return (
                        <Button key={c} type="button" size="sm" variant={on ? 'default' : 'outline'} disabled={off} onClick={() => setChannels((l) => toggle(l, c))} aria-pressed={on}>
                          {a.channelNames[c]}
                        </Button>
                      )
                    })}
                  </div>
                  {!needsTarget && <p className="mt-1 text-xs text-muted-foreground">{a.smsSingleOnly}</p>}
                  {channels.includes('SMS') && msg.bodyLo && <p className="mt-1 text-xs text-amber-700">{fill(a.smsParts, { n: smsParts(smsText) })}</p>}
                </Field>

                {/* When */}
                <Field required id="when" label={a.when}>
                  <div className="flex flex-wrap gap-2">
                    {BROADCAST_REPEATS.map((r) =>
                      r === 'ONCE' ? (
                        <span key={r} className="contents">
                          <Button type="button" size="sm" variant={repeat === 'ONCE' && !later ? 'default' : 'outline'} onClick={() => (setRepeat('ONCE'), setLater(false))}>
                            {a.whenNow}
                          </Button>
                          <Button type="button" size="sm" variant={repeat === 'ONCE' && later ? 'default' : 'outline'} onClick={() => (setRepeat('ONCE'), setLater(true))}>
                            {a.whenAt}
                          </Button>
                        </span>
                      ) : (
                        <Button key={r} type="button" size="sm" variant={repeat === r ? 'default' : 'outline'} onClick={() => setRepeat(r)}>
                          {a.repeats[r]}
                        </Button>
                      ),
                    )}
                  </div>
                </Field>
                {(later || repeat !== 'ONCE') && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field required id="startAt" label={repeat === 'ONCE' ? a.startAt : a.firstAt}>
                      <Input id="startAt" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                    </Field>
                    {repeat !== 'ONCE' && (
                      <Field id="endAt" label={a.endAt}>
                        <Input id="endAt" type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
                      </Field>
                    )}
                  </div>
                )}
                {repeat === 'WEEKLY' && (
                  <Field required id="weekdays" label={a.weekdays}>
                    <div className="flex flex-wrap gap-1.5">
                      {a.days.map((d, i) => (
                        <Button key={d} type="button" size="sm" variant={weekdays.includes(i) ? 'default' : 'outline'} onClick={() => setWeekdays((w) => toggle(w, i))}>
                          {d}
                        </Button>
                      ))}
                    </div>
                  </Field>
                )}

                {/* What */}
                {/* Personal details: {name}, {phone}, {shop}, filled in for each recipient. */}
                <div className="flex flex-col gap-1.5 rounded-lg border border-dashed bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{a.insert}</span>
                    {BROADCAST_VARIABLES.map((v) => (
                      <Button key={v} type="button" size="sm" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVariable(v)}>
                        {a.variables[v]} <code className="text-xs text-muted-foreground">{`{${v}}`}</code>
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {a.insertHint} {a.variableHint}
                  </p>
                </div>
                <Field required id="tlo" label={a.titleLo}>
                  <Input id="tlo" maxLength={120} {...textField('titleLo')} />
                </Field>
                <Field required id="blo" label={a.bodyLo}>
                  <Textarea id="blo" rows={3} maxLength={1000} {...textField('bodyLo')} />
                </Field>
                <Field required id="ten" label={a.titleEn}>
                  <Input id="ten" maxLength={120} {...textField('titleEn')} />
                </Field>
                <Field required id="ben" label={a.bodyEn}>
                  <Textarea id="ben" rows={3} maxLength={1000} {...textField('bodyEn')} />
                </Field>
                {personal && (
                  <div className="rounded-lg bg-brand-soft/60 p-3 text-sm">
                    <p className="mb-1.5 text-xs font-semibold text-primary">{a.preview}</p>
                    {(['lo', 'en'] as const).map((l) => {
                      const title = sample(l === 'lo' ? msg.titleLo : msg.titleEn)
                      const body = sample(l === 'lo' ? msg.bodyLo : msg.bodyEn)
                      return title || body ? (
                        <div key={l} className="mb-1.5 last:mb-0">
                          <p className="font-semibold">{title}</p>
                          <p className="whitespace-pre-line text-muted-foreground">{body}</p>
                        </div>
                      ) : null
                    })}
                  </div>
                )}
                <Field id="link" label={a.link} hint={audience === 'sellers' || audience === 'shop' ? a.linkHintShop : a.linkHint}>
                  <Input id="link" pattern="/\S*" className="font-mono" placeholder="/feed" value={msg.link} onChange={edit('link')} />
                </Field>
                <Button type="submit" className="self-end">
                  {later || repeat !== 'ONCE' ? <CalendarClock /> : <Send />}
                  {later || repeat !== 'ONCE' ? a.schedule : a.send}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="gap-3 self-start">
            <CardHeader>
              <CardTitle className="text-base">{a.history}</CardTitle>
            </CardHeader>
            <CardContent>
              {list.isPending ? (
                <LoadingState />
              ) : list.isError ? (
                <ErrorState onRetry={() => void list.refetch()} />
              ) : list.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">{a.noHistory}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {list.data.map((b) => {
                    const r = b.lastResult
                    return (
                      <li key={b.id} className="flex flex-col gap-1.5 py-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium">{(locale === 'lo' ? b.content.lo : b.content.en).title}</span>
                          <FlagBadge tone={b.status === 'ACTIVE' ? 'good' : b.status === 'PAUSED' ? 'warn' : 'muted'}>{a.status[b.status]}</FlagBadge>
                        </div>
                        <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          <FlagBadge tone={b.type === 'PROMOTION' ? 'warn' : 'info'}>{a.types[b.type]}</FlagBadge>
                          {b.target ? `${a.audiences[b.audience]}: ${b.target.name}` : a.audiences[b.audience]}
                          {' · '}
                          {b.channels.map((c) => a.channelNames[c]).join(', ')}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.repeats[b.repeat]}
                          {b.repeat === 'WEEKLY' && ` (${b.weekdays.map((d) => a.days[d]).join(', ')})`}
                          {b.nextRunAt && ` · ${fill(a.next, { date: vientiane(b.nextRunAt) })}`}
                        </span>
                        {b.lastRunAt && <span className="text-xs text-muted-foreground">{fill(a.lastSent, { date: vientiane(b.lastRunAt), n: b.runs })}</span>}
                        {r && (
                          <span className={`text-xs ${r.error ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {r.error ?? fill(a.result, { recipients: formatNumber(r.recipients, locale), inApp: formatNumber(r.inApp, locale), pushSent: formatNumber(r.pushSent, locale), pushFailed: formatNumber(r.pushFailed, locale), smsSent: formatNumber(r.smsSent, locale) })}
                          </span>
                        )}
                        <span className="flex flex-wrap items-center gap-1 pt-0.5">
                          <Button size="sm" variant="outline" onClick={() => void act(b, 'resend')}>
                            <RotateCw />
                            {a.resend}
                          </Button>
                          {b.status === 'ACTIVE' && b.repeat !== 'ONCE' && (
                            <Button size="sm" variant="outline" onClick={() => void act(b, 'pause')}>
                              <Pause />
                              {a.pause}
                            </Button>
                          )}
                          {b.status === 'PAUSED' && (
                            <Button size="sm" variant="outline" onClick={() => void act(b, 'resume')}>
                              <Play />
                              {a.resume}
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void act(b, 'delete')}>
                            <Trash2 />
                            {a.delete}
                          </Button>
                          {b.createdBy && <span className="ml-auto text-xs text-muted-foreground">{b.createdBy}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </PageBody>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

/** One customer or one shop, found by name or phone. */
function TargetPicker({ kind, value, onChange }: { kind: 'customer' | 'shop'; value: Target | null; onChange: (t: Target | null) => void }) {
  const { t, locale } = useI18n()
  const a = t.announcements
  const [q, setQ] = useState('')
  const term = useDeferredValue(q.trim())
  const results = useQuery({
    queryKey: ['admin', 'broadcasts', 'targets', kind, term],
    queryFn: () => api<Target[]>(`/admin/broadcasts/targets?${new URLSearchParams({ kind, q: term })}`),
    enabled: term.length >= 2 && !value,
  })
  if (value)
    return (
      <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{value.name}</p>
          <p className="text-xs text-muted-foreground">
            {value.phone ?? '—'}
            {value.phones !== undefined && ` · ${fill(a.phones, { n: formatNumber(value.phones, locale) })}`}
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)} aria-label={a.change}>
          <X />
          {a.change}
        </Button>
      </div>
    )
  return (
    <div className="flex flex-col gap-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={a.search} autoComplete="off" />
      {term.length >= 2 && results.data && (
        <ul className="max-h-60 overflow-y-auto rounded-lg border">
          {results.data.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">{a.noMatches}</li>}
          {results.data.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onChange(r)} className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted">
                <span className="font-medium">{r.name}</span>
                <span className="text-xs text-muted-foreground">
                  {r.phone ?? '—'}
                  {r.phones !== undefined && ` · ${fill(a.phones, { n: formatNumber(r.phones, locale) })}`}
                  {r.status && ` · ${r.status}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Textarea } from '@talad/ui/components/textarea'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FlagBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatDate, formatNumber } from '@/lib/format'
import type { Announcement } from '@/lib/types'

const KEY = ['admin', 'announcements'] as const
const EMPTY = { titleLo: '', bodyLo: '', titleEn: '', bodyEn: '', link: '' }

/** Broadcast a notification to every customer or seller (§2.11). */
export function AnnouncementsPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const history = useQuery({ queryKey: KEY, queryFn: () => api<Announcement[]>('/admin/announcements') })
  const [audience, setAudience] = useState<Announcement['audience']>('customers')
  const [type, setType] = useState<Announcement['type']>('SYSTEM')
  const [msg, setMsg] = useState(EMPTY)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const edit = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setMsg((m) => ({ ...m, [k]: e.target.value }))

  function submit() {
    if (![msg.titleLo, msg.bodyLo, msg.titleEn, msg.bodyEn].every((s) => s.trim())) return toast.error(t.announcements.required)
    setConfirm({
      title: fill(t.announcements.confirmTitle, { audience: t.announcements.audiences[audience] }),
      description: t.announcements.confirmBody,
      confirmLabel: t.announcements.send,
      onConfirm: async () => {
        const res = await send<{ recipients: number }>('POST', '/admin/announcements', {
          audience,
          type,
          lo: { title: msg.titleLo, body: msg.bodyLo },
          en: { title: msg.titleEn, body: msg.bodyEn },
          ...(msg.link.trim() && { link: msg.link.trim() }),
        })
        toast.success(fill(t.announcements.sent, { n: formatNumber(res.recipients, locale) }))
        setMsg(EMPTY)
        void queryClient.invalidateQueries({ queryKey: KEY })
      },
    })
  }

  return (
    <>
      <TopBar title={t.announcements.title} />
      <PageBody className="max-w-5xl">
        <PageIntro title={t.announcements.title} description={t.announcements.description} />
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          <Card className="gap-3">
            <CardHeader>
              <CardTitle className="text-base">{t.announcements.new}</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit()
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field required id="audience" label={t.announcements.audience}>
                    <Select value={audience} onValueChange={(v) => setAudience(v as Announcement['audience'])}>
                      <SelectTrigger id="audience" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="customers">{t.announcements.audiences.customers}</SelectItem>
                        <SelectItem value="sellers">{t.announcements.audiences.sellers}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field required id="type" label={t.announcements.type}>
                    <Select value={type} onValueChange={(v) => setType(v as Announcement['type'])}>
                      <SelectTrigger id="type" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SYSTEM">{t.announcements.types.SYSTEM}</SelectItem>
                        <SelectItem value="PROMOTION">{t.announcements.types.PROMOTION}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <Field required id="tlo" label={t.announcements.titleLo}>
                  <Input id="tlo" maxLength={120} value={msg.titleLo} onChange={edit('titleLo')} />
                </Field>
                <Field required id="blo" label={t.announcements.bodyLo}>
                  <Textarea id="blo" rows={3} maxLength={1000} value={msg.bodyLo} onChange={edit('bodyLo')} />
                </Field>
                <Field required id="ten" label={t.announcements.titleEn}>
                  <Input id="ten" maxLength={120} value={msg.titleEn} onChange={edit('titleEn')} />
                </Field>
                <Field required id="ben" label={t.announcements.bodyEn}>
                  <Textarea id="ben" rows={3} maxLength={1000} value={msg.bodyEn} onChange={edit('bodyEn')} />
                </Field>
                <Field id="link" label={t.announcements.link} hint={t.announcements.linkHint}>
                  <Input id="link" pattern="/\S*" className="font-mono" placeholder="/feed" value={msg.link} onChange={edit('link')} />
                </Field>
                <Button type="submit" className="self-end">
                  <Send />
                  {t.announcements.send}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card className="gap-3 self-start">
            <CardHeader>
              <CardTitle className="text-base">{t.announcements.history}</CardTitle>
            </CardHeader>
            <CardContent>
              {history.isPending ? (
                <LoadingState />
              ) : history.isError ? (
                <ErrorState onRetry={() => void history.refetch()} />
              ) : history.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.announcements.noHistory}</p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {history.data.map((a) => (
                    <li key={a.id} className="flex flex-col gap-1 py-2.5 text-sm">
                      <span className="font-medium">{(locale === 'lo' && a.titleLo) || a.title}</span>
                      <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                        <FlagBadge tone={a.type === 'PROMOTION' ? 'warn' : 'info'}>{t.announcements.types[a.type]}</FlagBadge>
                        {t.announcements.audiences[a.audience]} · {fill(t.announcements.recipients, { n: formatNumber(a.recipients, locale) })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(a.sentAt, locale, true)}
                        {a.by && ` · ${a.by}`}
                      </span>
                    </li>
                  ))}
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

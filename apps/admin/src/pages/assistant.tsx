import { ASSISTANT_TRAINING } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Switch } from '@talad/ui/components/switch'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Bot, Check, Eraser, Inbox, Languages, MessageSquarePlus, Pencil, Plus, RotateCcw, Send, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FlagBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { FilterTabs, Pager, SearchBox } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useSearchParamInput, useUrlParams } from '@/hooks/use-url-params'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatDate, formatNumber } from '@/lib/format'
import type { AssistantAnswer, AssistantMiss, AssistantOverview, AssistantTestReply, AssistantWord } from '@/lib/types'

const KEY = ['admin', 'assistant'] as const
const TABS = ['inbox', 'answers', 'words', 'test'] as const
type Tab = (typeof TABS)[number]

/** An answer being written: new (maybe from an inbox question), or one being edited. */
type AnswerDraft = Partial<AssistantAnswer> & { fromMiss?: string }
type WordDraft = Partial<AssistantWord> & { fromMiss?: string }

type ErrorKey = keyof Dict['assistant']['errors']
const errorText = (e: unknown, t: Dict) => (e instanceof ApiError && e.code && e.code in t.assistant.errors ? t.assistant.errors[e.code as ErrorKey] : t.common.saveError)

/** Lines (or commas) → a clean list. */
const toList = (text: string) => [...new Set(text.split(/\n|,/).map((s) => s.trim()).filter(Boolean))]

/**
 * Training Market Chat: the questions it couldn't answer (to teach from), the team's answers,
 * the words customers use, and a test chat that shows how each reply was decided.
 */
export function AssistantPage() {
  const { t, locale } = useI18n()
  const { params, set } = useUrlParams()
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'inbox'
  const overview = useQuery({ queryKey: [...KEY, 'overview'], queryFn: () => api<AssistantOverview>('/admin/assistant') })
  const [answer, setAnswer] = useState<AnswerDraft | null>(null)
  const [word, setWord] = useState<WordDraft | null>(null)
  const o = overview.data

  return (
    <>
      <TopBar title={t.assistant.title} />
      <PageBody>
        <PageIntro title={t.assistant.title} description={t.assistant.description} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t.assistant.stats.unanswered} value={o?.unanswered} tone={o?.unanswered ? 'warn' : undefined} />
          <Stat label={t.assistant.stats.answers} value={o?.answers} />
          <Stat label={t.assistant.stats.words} value={o?.words} />
          <Stat label={t.assistant.stats.answered} value={o ? formatNumber(o.answered, locale) : undefined} />
        </div>
        <FilterTabs
          tabs={TABS.map((k) => ({ key: k, label: t.assistant.tabs[k], count: k === 'inbox' ? o?.unanswered : k === 'answers' ? o?.answers : k === 'words' ? o?.words : undefined }))}
          active={tab}
          onSelect={(k) => set({ tab: k === 'inbox' ? undefined : k, page: undefined, q: undefined, done: undefined })}
        />
        {tab === 'inbox' && <InboxTab onTeachAnswer={(m) => setAnswer({ questions: [m.text], fromMiss: m.id })} onTeachWord={(m) => setWord({ word: m.text, fromMiss: m.id })} />}
        {tab === 'answers' && <AnswersTab onEdit={setAnswer} />}
        {tab === 'words' && <WordsTab onEdit={setWord} />}
        {tab === 'test' && <TestTab onTeach={(q) => setAnswer({ questions: [q] })} />}
      </PageBody>
      <Dialog open={answer !== null} onOpenChange={(open) => !open && setAnswer(null)}>
        <DialogContent className="sm:max-w-xl">{answer && <AnswerForm key={answer.id ?? answer.fromMiss ?? 'new'} value={answer} onDone={() => setAnswer(null)} />}</DialogContent>
      </Dialog>
      <Dialog open={word !== null} onOpenChange={(open) => !open && setWord(null)}>
        <DialogContent className="sm:max-w-md">{word && <WordForm key={word.id ?? word.fromMiss ?? 'new'} value={word} onDone={() => setWord(null)} />}</DialogContent>
      </Dialog>
    </>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string | undefined; tone?: 'warn' }) {
  return (
    <Card className="gap-1 py-3">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-xl font-semibold tabular-nums', tone === 'warn' && 'text-amber-600 dark:text-amber-400')}>{value ?? '—'}</p>
      </CardContent>
    </Card>
  )
}

/** After any change: the lists and the counts. */
function useRefresh() {
  const queryClient = useQueryClient()
  return () => void queryClient.invalidateQueries({ queryKey: KEY })
}

// ── Unanswered ───────────────────────────────────────────────────────────

function InboxTab({ onTeachAnswer, onTeachWord }: { onTeachAnswer: (m: AssistantMiss) => void; onTeachWord: (m: AssistantMiss) => void }) {
  const { t, locale } = useI18n()
  const refresh = useRefresh()
  const { params, set, page } = useUrlParams()
  const done = params.get('done') === '1'
  const q = params.get('q') ?? ''
  const [search, setSearch] = useSearchParamInput(q, set)
  const misses = useQuery({
    queryKey: [...KEY, 'misses', { done, q, page }],
    queryFn: () => api<{ items: AssistantMiss[]; total: number; pageSize: number }>(`/admin/assistant/unanswered?resolved=${done}&page=${page}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  })
  const resolve = useMutation({
    mutationFn: (m: AssistantMiss) => send('PATCH', `/admin/assistant/unanswered/${m.id}`, { resolved: !m.resolved }),
    onSuccess: (_, m) => {
      toast.success(m.resolved ? t.assistant.inbox.reopened : t.assistant.inbox.dismissed)
      refresh()
    },
    onError: () => toast.error(t.common.saveError),
  })

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t.assistant.inbox.intro}</p>
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <FilterTabs
          tabs={[
            { key: 'open', label: t.assistant.inbox.open },
            { key: 'done', label: t.assistant.inbox.done },
          ]}
          active={done ? 'done' : 'open'}
          onSelect={(k) => set({ done: k === 'done' ? '1' : undefined, page: undefined })}
        />
        <SearchBox value={search} onChange={setSearch} placeholder={t.assistant.inbox.search} />
      </div>
      {misses.isPending ? (
        <LoadingState />
      ) : misses.isError ? (
        <ErrorState onRetry={() => void misses.refetch()} />
      ) : misses.data.items.length === 0 ? (
        <EmptyState icon={Inbox} title={t.assistant.inbox.empty} body={t.assistant.inbox.emptyBody} />
      ) : (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {misses.data.items.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium break-words">{m.text}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <FlagBadge tone={m.outcome === 'related' ? 'info' : 'warn'}>{t.assistant.inbox.outcomes[m.outcome]}</FlagBadge>
                  <span className="font-medium text-foreground">{fill(t.assistant.inbox.asked, { n: formatNumber(m.count, locale) })}</span>·
                  <span>{fill(t.assistant.inbox.last, { date: formatDate(m.lastAt, locale, true) })}</span>·<span className="uppercase">{m.lang}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {!m.resolved && (
                  <>
                    <Button size="sm" onClick={() => onTeachAnswer(m)}>
                      <MessageSquarePlus />
                      {t.assistant.inbox.teachAnswer}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onTeachWord(m)}>
                      <Languages />
                      {t.assistant.inbox.teachWord}
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate(m)}>
                  {m.resolved ? <RotateCcw /> : <X />}
                  {m.resolved ? t.assistant.inbox.reopen : t.assistant.inbox.dismiss}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {misses.data && <Pager page={page} totalPages={Math.ceil(misses.data.total / misses.data.pageSize)} onPage={(p) => set({ page: String(p) })} />}
      <p className="text-xs text-muted-foreground">{t.assistant.inbox.privacy}</p>
    </div>
  )
}

// ── Answers ──────────────────────────────────────────────────────────────

function AnswersTab({ onEdit }: { onEdit: (a: AnswerDraft) => void }) {
  const { t, locale } = useI18n()
  const refresh = useRefresh()
  const answers = useQuery({ queryKey: [...KEY, 'answers'], queryFn: () => api<AssistantAnswer[]>('/admin/assistant/answers') })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">{t.assistant.answers.intro}</p>
        <Button className="self-start md:self-auto" onClick={() => onEdit({})}>
          <Plus />
          {t.assistant.answers.add}
        </Button>
      </div>
      {answers.isPending ? (
        <LoadingState />
      ) : answers.isError ? (
        <ErrorState onRetry={() => void answers.refetch()} />
      ) : answers.data.length === 0 ? (
        <EmptyState icon={BookOpen} title={t.assistant.answers.empty} body={t.assistant.answers.emptyBody} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {answers.data.map((a) => (
            <li key={a.id} className={cn('flex flex-col gap-2 rounded-xl border bg-card p-3', !a.isActive && 'opacity-60')}>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">
                  “{a.questions[0]}”
                  {a.questions.length > 1 && <span className="ml-1 font-normal text-muted-foreground">{fill(t.assistant.answers.moreQuestions, { n: a.questions.length - 1 })}</span>}
                </p>
                <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => onEdit(a)}>
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.common.delete}
                  onClick={() =>
                    setConfirm({
                      title: t.assistant.answers.deleteTitle,
                      description: t.assistant.answers.deleteBody,
                      confirmLabel: t.common.delete,
                      destructive: true,
                      onConfirm: async () => {
                        await send('DELETE', `/admin/assistant/answers/${a.id}`)
                        toast.success(t.assistant.answers.deleted)
                        refresh()
                      },
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              <p className="line-clamp-3 text-sm whitespace-pre-line text-muted-foreground">{locale === 'lo' ? a.answerLo : a.answerEn}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <FlagBadge tone={a.isActive ? 'good' : 'muted'}>{a.isActive ? t.assistant.answers.inUse : t.assistant.answers.off}</FlagBadge>
                {fill(t.assistant.answers.used, { n: formatNumber(a.hits, locale) })}
                {a.productWords && <span>· 🛍 {a.productWords}</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

function AnswerForm({ value, onDone }: { value: AnswerDraft; onDone: () => void }) {
  const { t } = useI18n()
  const refresh = useRefresh()
  const [questions, setQuestions] = useState((value.questions ?? []).join('\n'))
  const [answerLo, setAnswerLo] = useState(value.answerLo ?? '')
  const [answerEn, setAnswerEn] = useState(value.answerEn ?? '')
  const [productWords, setProductWords] = useState(value.productWords ?? '')
  const [isActive, setIsActive] = useState(value.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => {
      // One question per line (a question may contain commas).
      const body = { questions: [...new Set(questions.split(/\n/).map((q) => q.trim()).filter(Boolean))], answerLo, answerEn, productWords: productWords.trim() || null, isActive, fromMiss: value.fromMiss ?? null }
      return value.id ? send('PUT', `/admin/assistant/answers/${value.id}`, body) : send('POST', '/admin/assistant/answers', body)
    },
    onSuccess: () => {
      toast.success(t.common.saved)
      refresh()
      onDone()
    },
    onError: (e) => setError(errorText(e, t)),
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{value.id ? t.assistant.answers.edit : t.assistant.answers.add}</DialogTitle>
        <DialogDescription>{t.assistant.answers.intro}</DialogDescription>
      </DialogHeader>
      <Field required id="aq" label={t.assistant.answers.questions} hint={t.assistant.answers.questionsHint}>
        <Textarea id="aq" rows={3} value={questions} onChange={(e) => setQuestions(e.target.value)} maxLength={ASSISTANT_TRAINING.questionsMax * ASSISTANT_TRAINING.questionMax} />
      </Field>
      <Field id="alo" label={t.assistant.answers.answerLo} hint={t.assistant.answers.answerHint}>
        <Textarea id="alo" rows={3} value={answerLo} onChange={(e) => setAnswerLo(e.target.value)} maxLength={ASSISTANT_TRAINING.answerMax} />
      </Field>
      <Field id="aen" label={t.assistant.answers.answerEn}>
        <Textarea id="aen" rows={3} value={answerEn} onChange={(e) => setAnswerEn(e.target.value)} maxLength={ASSISTANT_TRAINING.answerMax} />
      </Field>
      <Field id="apw" label={t.assistant.answers.productWords} hint={t.assistant.answers.productWordsHint}>
        <Input id="apw" value={productWords} onChange={(e) => setProductWords(e.target.value)} maxLength={ASSISTANT_TRAINING.productWordsMax} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        {t.assistant.answers.inUse}
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
          <Check />
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── Words ────────────────────────────────────────────────────────────────

function WordsTab({ onEdit }: { onEdit: (w: WordDraft) => void }) {
  const { t } = useI18n()
  const refresh = useRefresh()
  const words = useQuery({ queryKey: [...KEY, 'words'], queryFn: () => api<AssistantWord[]>('/admin/assistant/words') })
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">{t.assistant.words.intro}</p>
        <Button className="self-start md:self-auto" onClick={() => onEdit({})}>
          <Plus />
          {t.assistant.words.add}
        </Button>
      </div>
      {words.isPending ? (
        <LoadingState />
      ) : words.isError ? (
        <ErrorState onRetry={() => void words.refetch()} />
      ) : words.data.length === 0 ? (
        <EmptyState icon={Languages} title={t.assistant.words.empty} body={t.assistant.words.emptyBody} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {words.data.map((w) => (
            <li key={w.id} className="flex items-center gap-2 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">“{w.word}”</p>
                <p className="truncate text-xs text-muted-foreground">→ {w.means.join(', ')}</p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => onEdit(w)}>
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t.common.delete}
                onClick={() =>
                  setConfirm({
                    title: fill(t.assistant.words.deleteTitle, { word: w.word }),
                    description: t.assistant.words.deleteBody,
                    confirmLabel: t.common.delete,
                    destructive: true,
                    onConfirm: async () => {
                      await send('DELETE', `/admin/assistant/words/${w.id}`)
                      toast.success(t.assistant.words.deleted)
                      refresh()
                    },
                  })
                }
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

function WordForm({ value, onDone }: { value: WordDraft; onDone: () => void }) {
  const { t } = useI18n()
  const refresh = useRefresh()
  const [word, setWord] = useState(value.word ?? '')
  const [means, setMeans] = useState((value.means ?? []).join('\n'))
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => {
      const body = { word, means: toList(means).slice(0, ASSISTANT_TRAINING.meansMax), fromMiss: value.fromMiss ?? null }
      return value.id ? send('PUT', `/admin/assistant/words/${value.id}`, body) : send('POST', '/admin/assistant/words', body)
    },
    onSuccess: () => {
      toast.success(t.common.saved)
      refresh()
      onDone()
    },
    onError: (e) => setError(errorText(e, t)),
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{value.id ? t.assistant.words.edit : t.assistant.words.add}</DialogTitle>
        <DialogDescription>{t.assistant.words.intro}</DialogDescription>
      </DialogHeader>
      <Field required id="ww" label={t.assistant.words.word} hint={t.assistant.words.wordHint}>
        <Input id="ww" required value={word} onChange={(e) => setWord(e.target.value)} maxLength={ASSISTANT_TRAINING.wordMax} />
      </Field>
      <Field required id="wm" label={t.assistant.words.means} hint={t.assistant.words.meansHint}>
        <Textarea id="wm" rows={3} value={means} onChange={(e) => setMeans(e.target.value)} placeholder={'pants\ntrousers'} />
      </Field>
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
          <Check />
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

// ── Test ─────────────────────────────────────────────────────────────────

type Turn = { role: 'user'; text: string } | { role: 'assistant'; text: string; reply: AssistantTestReply; question: string }

function TestTab({ onTeach }: { onTeach: (question: string) => void }) {
  const { t, locale } = useI18n()
  const [turns, setTurns] = useState<Turn[]>([])
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const ask = useMutation({
    mutationFn: (message: string) =>
      send<AssistantTestReply>('POST', '/admin/assistant/test', {
        message,
        locale,
        history: turns.slice(-10).map((x) => ({ role: x.role, text: x.text })),
      }),
    onSuccess: (reply, message) => {
      setTurns((prev) => [...prev, { role: 'assistant', text: reply.reply, reply, question: message }])
      setTimeout(() => end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
    },
    onError: () => toast.error(t.common.loadError),
  })

  function submit() {
    const message = text.trim()
    if (!message || ask.isPending) return
    setTurns((prev) => [...prev, { role: 'user', text: message }])
    setText('')
    ask.mutate(message)
  }

  /** "intent:compare" → the rule's family label, with the detail after it. */
  const viaLabel = (via?: string) => {
    if (!via) return null
    const [kind, detail] = via.split(':') as [keyof Dict['assistant']['test']['vias'], string | undefined]
    return `${t.assistant.test.vias[kind] ?? kind}${detail ? ` · ${detail}` : ''}`
  }

  return (
    <Card className="gap-0 py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">{t.assistant.test.intro}</p>
          {turns.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setTurns([])}>
              <Eraser />
              {t.assistant.test.clear}
            </Button>
          )}
        </div>
        <div className="flex max-h-[28rem] min-h-48 flex-col gap-3 overflow-y-auto rounded-lg bg-muted/40 p-3">
          {turns.length === 0 && <p className="m-auto text-sm text-muted-foreground">{t.assistant.test.empty}</p>}
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <p key={i} className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
                {turn.text}
              </p>
            ) : (
              <div key={i} className="flex max-w-[85%] flex-col gap-1.5 self-start">
                <p className="rounded-2xl rounded-bl-sm border bg-card px-3 py-2 text-sm whitespace-pre-line">{turn.text}</p>
                {turn.reply.products.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    🛍 {fill(t.assistant.test.products, { n: turn.reply.products.length })}: {turn.reply.products.slice(0, 4).map((p) => p.name).join(' · ')}
                  </p>
                )}
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Bot className="size-3.5" />
                  {t.assistant.test.via}: <span className="font-medium text-foreground">{viaLabel(turn.reply.via)}</span>· {t.assistant.test.engine[turn.reply.engine]}
                  {turn.reply.miss && <FlagBadge tone="warn">{t.assistant.test.wouldLog}</FlagBadge>}
                </p>
                <Button variant="link" size="sm" className="h-auto self-start p-0 text-xs" onClick={() => onTeach(turn.question)}>
                  <MessageSquarePlus />
                  {t.assistant.test.teach}
                </Button>
              </div>
            ),
          )}
          {ask.isPending && <p className="self-start text-sm text-muted-foreground">…</p>}
          <div ref={end} />
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={t.assistant.test.placeholder} maxLength={500} />
          <Button type="submit" disabled={!text.trim() || ask.isPending}>
            <Send />
            {t.assistant.test.send}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

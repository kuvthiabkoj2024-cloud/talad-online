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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Label } from '@talad/ui/components/label'
import { Textarea } from '@talad/ui/components/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, CircleAlert, CircleCheck, LoaderCircle, MessageCircleQuestion, Pencil, Plus, RotateCcw, SendHorizontal, Sparkles, Trash2, UserRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { queryKeys } from '@/hooks/queries'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatNumber } from '@/lib/format'
import type { BotPreview, ChatbotOverview, ShopFaq } from '@/lib/types'
import { BotProducts } from './messages'

const BASE = '/me/shop/chatbot'

/**
 * The shop's chat bot (always on): what it does, what it knows (with links to fill gaps),
 * the seller's FAQ it answers from, and a box to try it.
 */
export function ChatbotPage() {
  const { t } = useI18n()
  const overview = useQuery({ queryKey: queryKeys.chatbot, queryFn: () => api<ChatbotOverview>(BASE) })

  return (
    <>
      <TopBar title={t.chatbot.title} backTo="/" />
      <PageBody>
        <PageIntro title={t.chatbot.title} description={t.chatbot.description} />
        {overview.isPending ? (
          <LoadingState />
        ) : overview.isError ? (
          <ErrorState onRetry={() => void overview.refetch()} />
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <div className="flex min-w-0 flex-col gap-5">
              <StatusCard data={overview.data} />
              <FaqCard faqs={overview.data.faqs} />
            </div>
            <TryCard />
          </div>
        )}
      </PageBody>
    </>
  )
}

function StatusCard({ data }: { data: ChatbotOverview }) {
  const { t, locale } = useI18n()
  const k = data.knows
  const items: { label: string; ok: boolean; to: string }[] = [
    { label: k.products ? fill(t.chatbot.products, { n: formatNumber(k.products, locale) }) : fill(t.chatbot.products, { n: 0 }), ok: k.products > 0, to: '/products' },
    { label: t.chatbot.hours, ok: k.hours, to: '/profile' },
    { label: t.chatbot.address, ok: k.address, to: '/profile' },
    { label: t.chatbot.transfer, ok: k.transfer, to: '/profile' },
    { label: t.chatbot.about, ok: k.description, to: '/profile' },
    { label: fill(t.chatbot.faqCount, { n: data.faqs.length }), ok: data.faqs.length > 0, to: '#faq' },
  ]
  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Bot className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-sm font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                <span className="size-2 rounded-full bg-emerald-500" />
                {t.chatbot.on}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                {data.engine === 'ai' && <Sparkles className="size-3" />}
                {data.engine === 'ai' ? t.chatbot.engineAi : t.chatbot.engineBasic}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{t.chatbot.onBody}</p>
          </div>
        </div>
        <p className="rounded-xl bg-muted/60 p-3 text-sm leading-relaxed">{t.chatbot.how}</p>
        <div>
          <h3 className="font-semibold">{t.chatbot.knowsTitle}</h3>
          <p className="text-sm text-muted-foreground">{t.chatbot.knowsBody}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {items.map((i) => (
              <li key={i.label} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                {i.ok ? <CircleCheck className="size-4 shrink-0 text-emerald-600" /> : <CircleAlert className="size-4 shrink-0 text-amber-500" />}
                <span className="min-w-0 flex-1 truncate">
                  {i.label}
                  {!i.ok && <span className="text-muted-foreground"> · {t.chatbot.missing}</span>}
                </span>
                {!i.ok &&
                  (i.to.startsWith('#') ? (
                    <a href={i.to} className="shrink-0 font-medium text-primary hover:underline">
                      {t.chatbot.addFaq}
                    </a>
                  ) : (
                    <Link to={i.to} className="shrink-0 font-medium text-primary hover:underline">
                      {t.chatbot.edit}
                    </Link>
                  ))}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function FaqCard({ faqs }: { faqs: ShopFaq[] }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ShopFaq | 'new' | null>(null)
  const [deleting, setDeleting] = useState<ShopFaq | null>(null)
  const remove = useMutation({
    mutationFn: (id: string) => send('DELETE', `${BASE}/faqs/${id}`),
    onSuccess: () => {
      toast.success(t.chatbot.deleted)
      setDeleting(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatbot })
    },
    onError: () => toast.error(t.chatbot.errors.generic),
  })

  return (
    <Card id="faq" className="scroll-mt-20">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{t.chatbot.faqTitle}</CardTitle>
          <CardDescription>{t.chatbot.faqBody}</CardDescription>
        </div>
        <Button size="sm" onClick={() => setEditing('new')} disabled={faqs.length >= 50}>
          <Plus /> {t.chatbot.addFaq}
        </Button>
      </CardHeader>
      <CardContent>
        {faqs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
            <MessageCircleQuestion className="size-8 text-muted-foreground" />
            <p className="max-w-sm text-sm text-muted-foreground">{t.chatbot.emptyFaq}</p>
          </div>
        ) : (
          <ul className="divide-y rounded-xl border">
            {faqs.map((f) => (
              <li key={f.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{f.question}</p>
                  <p className="mt-0.5 text-sm break-words whitespace-pre-wrap text-muted-foreground">{f.answer}</p>
                </div>
                <Button variant="ghost" size="icon" aria-label={t.chatbot.edit} onClick={() => setEditing(f)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t.chatbot.delete} className="hover:text-destructive" onClick={() => setDeleting(f)}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {editing && <FaqDialog faq={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.chatbot.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.question}” — {t.chatbot.deleteBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.chatbot.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                if (deleting) remove.mutate(deleting.id)
              }}
            >
              {remove.isPending && <LoaderCircle className="animate-spin" />}
              {t.chatbot.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function FaqDialog({ faq, onClose }: { faq: ShopFaq | null; onClose: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [question, setQuestion] = useState(faq?.question ?? '')
  const [answer, setAnswer] = useState(faq?.answer ?? '')
  const save = useMutation({
    mutationFn: () => (faq ? send('PATCH', `${BASE}/faqs/${faq.id}`, { question, answer }) : send('POST', `${BASE}/faqs`, { question, answer })),
    onSuccess: () => {
      toast.success(t.chatbot.saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.chatbot })
      onClose()
    },
    onError: (e) => {
      const code = e instanceof ApiError ? e.code : undefined
      toast.error(code && code in t.chatbot.errors ? t.chatbot.errors[code as keyof typeof t.chatbot.errors] : t.chatbot.errors.generic)
    },
  })
  const valid = question.trim() && answer.trim()

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{faq ? t.chatbot.editFaq : t.chatbot.addFaq}</DialogTitle>
          <DialogDescription>{t.chatbot.questionHint}</DialogDescription>
        </DialogHeader>
        <form
          id="faq-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) save.mutate()
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="faq-q" required>
              {t.chatbot.question}
            </Label>
            <Textarea id="faq-q" rows={2} maxLength={200} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t.chatbot.questionPlaceholder} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="faq-a" required>
              {t.chatbot.answer}
            </Label>
            <Textarea id="faq-a" rows={4} maxLength={1000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder={t.chatbot.answerPlaceholder} />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t.chatbot.cancel}
          </Button>
          <Button type="submit" form="faq-form" disabled={!valid || save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            {t.chatbot.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type TryTurn = { role: 'user'; text: string } | { role: 'assistant'; reply: BotPreview }

/** A test chat with the bot: nothing is sent to customers or saved. */
function TryCard() {
  const { t } = useI18n()
  const [turns, setTurns] = useState<TryTurn[]>([])
  const [text, setText] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const ask = useMutation({
    mutationFn: (message: string) =>
      send<BotPreview>('POST', `${BASE}/preview`, {
        message,
        history: turns.slice(-10).map((x) => (x.role === 'user' ? x : { role: 'assistant', text: x.reply.text })),
      }),
    onSuccess: (reply) => setTurns((prev) => [...prev, { role: 'assistant', reply }]),
    onError: () => toast.error(t.chatbot.errors.generic),
  })

  // Newest reply in view, scrolling the test chat only (not the page).
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight
  }, [turns.length, ask.isPending])

  function submit() {
    const message = text.trim()
    if (!message || ask.isPending) return
    setTurns((prev) => [...prev, { role: 'user', text: message }])
    setText('')
    ask.mutate(message)
  }

  return (
    <Card className="lg:sticky lg:top-20">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{t.chatbot.tryTitle}</CardTitle>
          <CardDescription>{t.chatbot.tryBody}</CardDescription>
        </div>
        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setTurns([])}>
            <RotateCcw /> {t.chatbot.reset}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div ref={box} className="flex h-96 flex-col gap-3 overflow-y-auto rounded-xl bg-muted/50 p-3">
          {turns.length === 0 && <p className="m-auto text-center text-sm text-muted-foreground">{t.chatbot.tryEmpty}</p>}
          {turns.map((turn, i) =>
            turn.role === 'user' ? (
              <div key={i} className="flex items-end justify-start gap-2 pr-[15%]">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-background text-muted-foreground ring-1 ring-border">
                  <UserRound className="size-4" />
                </span>
                <p className="rounded-2xl rounded-bl-md bg-card px-3 py-2 text-sm break-words whitespace-pre-wrap shadow-sm ring-1 ring-border">{turn.text}</p>
              </div>
            ) : (
              <div key={i} className="flex flex-col items-end gap-1 pl-[15%]">
                <span className="flex flex-wrap items-center justify-end gap-1 text-[11px] text-muted-foreground">
                  <Bot className="size-3.5" />
                  {fill(t.chatbot.understood, { topic: t.chatbot.topics[turn.reply.topic] })}
                  {turn.reply.handoff && <span className="rounded-full bg-amber-100 px-1.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">{t.chatbot.handoff}</span>}
                  {turn.reply.order && <span className="rounded-full bg-primary/10 px-1.5 font-medium text-primary">🛍 {t.chatbot.orderCard}</span>}
                </span>
                <p className="rounded-2xl rounded-br-md bg-brand-soft px-3 py-2 text-sm break-words whitespace-pre-wrap shadow-sm ring-1 ring-primary/20">{turn.reply.text}</p>
                {turn.reply.products.length > 0 && <BotProducts products={turn.reply.products} />}
              </div>
            ),
          )}
          {ask.isPending && (
            <div className="flex justify-end">
              <span className="flex items-center gap-1 rounded-2xl rounded-br-md bg-brand-soft px-3 py-3 ring-1 ring-primary/20">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="size-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: `${d}ms` }} />
                ))}
              </span>
            </div>
          )}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <Textarea
            rows={1}
            value={text}
            maxLength={1000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={t.chatbot.tryPlaceholder}
            aria-label={t.chatbot.tryPlaceholder}
            className="max-h-32 min-h-10 resize-none"
          />
          <Button type="submit" size="icon" disabled={!text.trim() || ask.isPending} aria-label={t.chatbot.send} className="shrink-0">
            <SendHorizontal />
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

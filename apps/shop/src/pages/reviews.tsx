import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EyeOff, LoaderCircle, MessageSquareReply, Star, Store } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FilterTabs, Pager } from '@/components/list-controls'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { queryKeys } from '@/hooks/queries'
import { useUrlParams } from '@/hooks/use-url-params'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatDate, formatNumber } from '@/lib/format'
import type { ShopReview, ShopReviewList } from '@/lib/types'

const FILTERS = ['all', 'unreplied', '5', '4', '3', '2', '1'] as const
type Filter = (typeof FILTERS)[number]

/** Reviews of the shop and its products, with replies (§3.8). */
export function ReviewsPage() {
  const { t, locale } = useI18n()
  const { params, set, page } = useUrlParams()
  const filter = (FILTERS as readonly string[]).includes(params.get('filter') ?? '') ? (params.get('filter') as Filter) : 'all'
  const query = new URLSearchParams({ page: String(page) })
  if (filter === 'unreplied') query.set('unreplied', 'true')
  else if (filter !== 'all') query.set('rating', filter)
  const list = useQuery({
    queryKey: [...queryKeys.reviews, { filter, page }],
    queryFn: () => api<ShopReviewList>(`/me/shop/reviews?${query}`),
    placeholderData: keepPreviousData,
  })
  const s = list.data?.summary

  return (
    <>
      <TopBar title={t.reviews.title} backTo="/" />
      <PageBody>
        <PageIntro title={t.reviews.title} description={t.reviews.description} />
        {s && s.count > 0 && (
          <Card className="py-4">
            <CardContent className="flex flex-wrap items-center gap-6">
              <div className="flex flex-col items-center gap-1">
                <span className="text-4xl font-semibold tabular-nums">{s.average.toFixed(1)}</span>
                <Stars value={s.average} />
                <span className="text-xs text-muted-foreground">{fill(t.reviews.count, { n: formatNumber(s.count, locale) })}</span>
              </div>
              <ul className="flex min-w-48 flex-1 flex-col gap-1">
                {(['5', '4', '3', '2', '1'] as const).map((r) => (
                  <li key={r} className="flex items-center gap-2 text-xs">
                    <span className="w-3 tabular-nums">{r}</span>
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full rounded-full bg-amber-400" style={{ width: `${(s.byRating[r] / s.count) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right text-muted-foreground tabular-nums">{s.byRating[r]}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <FilterTabs
          tabs={FILTERS.map((f) => ({
            key: f,
            label: f === 'all' ? t.reviews.all : f === 'unreplied' ? t.reviews.unreplied : fill(t.reviews.stars, { n: f }),
            count: f === 'unreplied' ? s?.unreplied : f === 'all' ? s?.count : s?.byRating[f],
          }))}
          active={filter}
          onSelect={(k) => set({ filter: k === 'all' ? undefined : k, page: undefined })}
        />

        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState icon={Star} title={t.reviews.emptyTitle} body={t.reviews.emptyBody} />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <ReviewCard review={r} />
                </li>
              ))}
            </ul>
            <Pager page={list.data.page} totalPages={list.data.totalPages} onPage={(p) => set({ page: String(p) })} />
          </>
        )}
      </PageBody>
    </>
  )
}

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('flex', className)} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('size-4', n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
      ))}
    </span>
  )
}

function ReviewCard({ review: r }: { review: ShopReview }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(r.reply ?? '')
  const save = useMutation({
    mutationFn: (reply: string | null) => send('PUT', `/me/shop/reviews/${r.id}/reply`, { reply }),
    onSuccess: () => {
      toast.success(t.reviews.saved)
      setEditing(false)
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews })
    },
    onError: () => toast.error(t.common.saveError),
  })

  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Stars value={r.rating} />
            <p className="mt-1 text-sm font-medium">{r.customer.name}</p>
            <p className="text-xs text-muted-foreground">{formatDate(r.createdAt, locale)}</p>
          </div>
          {r.product ? (
            <span className="flex max-w-xs items-center gap-2 rounded-lg bg-muted px-2 py-1.5 text-xs">
              {r.product.imageUrl && <img src={r.product.imageUrl} alt="" className="size-7 rounded object-cover" />}
              <span className="line-clamp-2">{r.product.name}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1.5 text-xs">
              <Store className="size-3.5" />
              {t.reviews.shopReview}
            </span>
          )}
        </div>
        {r.isHidden && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <EyeOff className="size-3.5" />
            {t.reviews.hidden}
          </p>
        )}
        {r.comment && <p className="text-sm whitespace-pre-line">{r.comment}</p>}
        {r.mediaUrls.length > 0 && (
          <div className="flex gap-2">
            {r.mediaUrls.map((u) => (
              <img key={u} src={u} alt="" className="size-16 rounded-lg object-cover" />
            ))}
          </div>
        )}

        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) save.mutate(text.trim())
            }}
          >
            <Textarea autoFocus rows={3} maxLength={1000} value={text} placeholder={t.reviews.replyPlaceholder} onChange={(e) => setText(e.target.value)} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => (setEditing(false), setText(r.reply ?? ''))}>
                {t.common.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={save.isPending || !text.trim()}>
                {save.isPending && <LoaderCircle className="animate-spin" />}
                {t.common.save}
              </Button>
            </div>
          </form>
        ) : r.reply ? (
          <div className="rounded-lg border-l-2 border-primary bg-brand-soft/50 px-3 py-2 text-sm">
            <p className="text-xs font-medium text-primary">{t.reviews.yourReply}</p>
            <p className="whitespace-pre-line">{r.reply}</p>
            <div className="mt-1 flex gap-1">
              <Button variant="link" size="sm" className="h-auto px-0" onClick={() => setEditing(true)}>
                {t.reviews.editReply}
              </Button>
              <span className="text-muted-foreground">·</span>
              <Button variant="link" size="sm" className="h-auto px-0 text-destructive" disabled={save.isPending} onClick={() => save.mutate(null)}>
                {t.reviews.deleteReply}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setEditing(true)}>
            <MessageSquareReply />
            {t.reviews.reply}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

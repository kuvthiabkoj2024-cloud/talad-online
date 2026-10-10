import type { Locale } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { Tabs, TabsList, TabsTrigger } from '@talad/ui/components/tabs'
import { Textarea } from '@talad/ui/components/textarea'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Field } from '@/components/field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { fill, formatDate, storefrontUrl } from '@/lib/format'
import type { CmsPage } from '@/lib/types'

const KEY = ['admin', 'pages'] as const
const SLUGS = ['about', 'terms', 'privacy', 'faq'] as const
type Slug = (typeof SLUGS)[number]

/** About / Terms / Privacy / FAQ text (§2.11), in Lao and English. */
export function PagesPage() {
  const { t } = useI18n()
  const list = useQuery({ queryKey: KEY, queryFn: () => api<CmsPage[]>('/admin/pages') })
  const [slug, setSlug] = useState<Slug>('about')

  return (
    <>
      <TopBar title={t.pages.title} />
      <PageBody className="max-w-4xl">
        <PageIntro title={t.pages.title} description={t.pages.description} />
        <Tabs value={slug} onValueChange={(v) => setSlug(v as Slug)}>
          <TabsList className="h-auto flex-wrap">
            {SLUGS.map((s) => (
              <TabsTrigger key={s} value={s}>
                {t.pages.names[s]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : (
          <PageEditor key={slug} slug={slug} page={list.data.find((p) => p.slug === slug)} />
        )}
      </PageBody>
    </>
  )
}

function PageEditor({ slug, page }: { slug: Slug; page?: CmsPage }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [content, setContent] = useState(() => ({
    lo: { title: page?.content.lo?.title ?? '', body: page?.content.lo?.body ?? '' },
    en: { title: page?.content.en?.title ?? '', body: page?.content.en?.body ?? '' },
  }))
  const edit = (l: Locale, k: 'title' | 'body', v: string) => setContent((c) => ({ ...c, [l]: { ...c[l], [k]: v } }))
  const save = useMutation({
    mutationFn: () => send<CmsPage>('PUT', `/admin/pages/${slug}`, { lo: content.lo, ...(content.en.title.trim() && { en: content.en }) }),
    onSuccess: () => {
      toast.success(t.common.saved)
      void queryClient.invalidateQueries({ queryKey: KEY })
    },
    onError: () => toast.error(t.common.saveError),
  })

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      {(['lo', 'en'] as const).map((l) => (
        <Card key={l} className="gap-3">
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm font-semibold">
              {l === 'lo' ? t.common.lao : t.common.english}
              {l === 'en' && <span className="font-normal text-muted-foreground"> · {t.common.optional}</span>}
            </p>
            <Field id={`${l}-title`} label={t.pages.pageTitle} required={l === 'lo'}>
              <Input id={`${l}-title`} required={l === 'lo'} maxLength={120} value={content[l].title} onChange={(e) => edit(l, 'title', e.target.value)} />
            </Field>
            <Field id={`${l}-body`} label={t.pages.body} hint={t.pages.bodyHint}>
              <Textarea id={`${l}-body`} rows={14} maxLength={50_000} className="font-mono text-sm" value={content[l].body} onChange={(e) => edit(l, 'body', e.target.value)} />
            </Field>
          </CardContent>
        </Card>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{page && fill(t.pages.updated, { date: formatDate(page.updatedAt, locale, true) })}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" asChild>
            <a href={storefrontUrl.page(locale, slug)} target="_blank" rel="noreferrer">
              <ExternalLink />
              {t.pages.preview}
            </a>
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending && <LoaderCircle className="animate-spin" />}
            {t.common.save}
          </Button>
        </div>
      </div>
    </form>
  )
}

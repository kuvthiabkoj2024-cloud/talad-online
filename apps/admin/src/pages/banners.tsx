import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Label } from '@talad/ui/components/label'
import { Switch } from '@talad/ui/components/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GalleryHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FlagBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { ImageField } from '@/components/image-field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { useI18n } from '@/i18n/context'
import { api, send } from '@/lib/api'
import { formatDate, localized, toLocalInput } from '@/lib/format'
import type { Banner } from '@/lib/types'

const KEY = ['admin', 'banners'] as const
const DAY = 86_400_000

/** Defaults for a new banner: live now for 30 days. */
function blank(): Partial<Banner> {
  const now = Date.now()
  return { title: {}, imageUrl: '', sortOrder: 0, isActive: true, startsAt: new Date(now).toISOString(), endsAt: new Date(now + 30 * DAY).toISOString() }
}

/** Storefront home banners (§2.8). */
export function BannersPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: () => api<Banner[]>('/admin/banners') })
  const [editing, setEditing] = useState<Partial<Banner> | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY })

  return (
    <>
      <TopBar title={t.banners.title} />
      <PageBody>
        <PageIntro
          title={t.banners.title}
          description={t.banners.description}
          actions={
            <Button onClick={() => setEditing(blank())}>
              <Plus />
              {t.banners.add}
            </Button>
          }
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState icon={GalleryHorizontal} title={t.banners.emptyTitle} body={t.banners.emptyBody} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.data.map((b) => (
              <Card key={b.id} className="gap-0 overflow-hidden py-0">
                <img src={b.imageUrl} alt="" className="aspect-[3/1] w-full bg-muted object-cover" />
                <CardContent className="flex items-start gap-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 font-medium">{localized(b.title, locale) || '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(b.startsAt, locale)} – {formatDate(b.endsAt, locale)}
                      {b.linkTarget && <span className="font-mono"> · {b.linkTarget}</span>}
                    </p>
                    <div className="mt-2 flex gap-1">
                      {b.live ? <FlagBadge tone="good">{t.banners.live}</FlagBadge> : <FlagBadge tone="muted">{t.banners.scheduled}</FlagBadge>}
                      {!b.isActive && <FlagBadge tone="muted">{t.common.inactive}</FlagBadge>}
                      <FlagBadge tone="muted">
                        {t.banners.order} {b.sortOrder}
                      </FlagBadge>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => setEditing(b)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.common.delete}
                    onClick={() =>
                      setConfirm({
                        title: t.banners.deleteTitle,
                        description: t.catalog.deleteBody,
                        confirmLabel: t.common.delete,
                        destructive: true,
                        onConfirm: async () => {
                          await send('DELETE', `/admin/banners/${b.id}`)
                          refresh()
                          toast.success(t.catalog.deleted)
                        },
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageBody>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          {editing && <BannerForm key={editing.id ?? 'new'} value={editing} onDone={() => (setEditing(null), refresh())} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function BannerForm({ value, onDone }: { value: Partial<Banner>; onDone: () => void }) {
  const { t } = useI18n()
  const [imageUrl, setImageUrl] = useState(value.imageUrl ?? '')
  const [lo, setLo] = useState(value.title?.lo ?? '')
  const [en, setEn] = useState(value.title?.en ?? '')
  const [link, setLink] = useState(value.linkTarget ?? '')
  const [sortOrder, setSortOrder] = useState(String(value.sortOrder ?? 0))
  const [startsAt, setStartsAt] = useState(toLocalInput(new Date(value.startsAt ?? 0)))
  const [endsAt, setEndsAt] = useState(toLocalInput(new Date(value.endsAt ?? 0)))
  const [isActive, setIsActive] = useState(value.isActive ?? true)
  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: { lo, ...(en.trim() && { en }) },
        imageUrl,
        linkTarget: link.trim() || null,
        sortOrder: Number(sortOrder) || 0,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        isActive,
      }
      return value.id ? send('PUT', `/admin/banners/${value.id}`, body) : send('POST', '/admin/banners', body)
    },
    onSuccess: () => {
      toast.success(t.common.saved)
      onDone()
    },
    onError: () => toast.error(t.common.saveError),
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!imageUrl) return toast.error(t.banners.imageHint)
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{value.id ? t.banners.edit : t.banners.add}</DialogTitle>
        <DialogDescription>{t.banners.imageHint}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label required>{t.banners.image}</Label>
        <ImageField value={imageUrl} onChange={setImageUrl} />
      </div>
      <Field required id="blo" label={t.banners.titleLo}>
        <Input id="blo" required maxLength={100} value={lo} onChange={(e) => setLo(e.target.value)} />
      </Field>
      <Field id="ben" label={t.banners.titleEn}>
        <Input id="ben" maxLength={100} value={en} onChange={(e) => setEn(e.target.value)} />
      </Field>
      <Field id="blink" label={t.banners.link} hint={t.banners.linkHint}>
        <Input id="blink" pattern="/\S*" className="font-mono" value={link} placeholder="/c/food" onChange={(e) => setLink(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field required id="bstart" label={t.banners.startsAt}>
          <Input id="bstart" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field required id="bend" label={t.banners.endsAt}>
          <Input id="bend" type="datetime-local" required min={startsAt} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-end gap-6">
        <Field required id="border" label={t.banners.order}>
          <Input id="border" inputMode="numeric" className="w-24" value={sortOrder} onChange={(e) => setSortOrder(e.target.value.replace(/\D/g, ''))} />
        </Field>
        <label className="flex h-9 items-center gap-2 text-sm">
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          {t.common.active}
        </label>
      </div>
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

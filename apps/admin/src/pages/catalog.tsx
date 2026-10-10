import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Switch } from '@talad/ui/components/switch'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderTree, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FlagBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { ImageField } from '@/components/image-field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { ErrorState, LoadingState } from '@/components/states'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, localized } from '@/lib/format'
import type { Category, Unit } from '@/lib/types'

const CATS = ['admin', 'categories'] as const
const UNITS = ['admin', 'units'] as const
type ErrorKey = keyof Dict['catalog']['errors']
const errorText = (e: unknown, t: Dict) => (e instanceof ApiError && e.code && e.code in t.catalog.errors ? t.catalog.errors[e.code as ErrorKey] : t.common.saveError)

/** Category tree and units (§2.6). */
export function CatalogPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const cats = useQuery({ queryKey: CATS, queryFn: () => api<Category[]>('/admin/categories') })
  const units = useQuery({ queryKey: UNITS, queryFn: () => api<Unit[]>('/admin/units') })
  const [editCat, setEditCat] = useState<Partial<Category> | null>(null)
  const [editUnit, setEditUnit] = useState<Partial<Unit> | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)

  const remove = (kind: 'categories' | 'units', id: string, name: string) =>
    setConfirm({
      title: fill(t.catalog.deleteTitle, { name }),
      description: t.catalog.deleteBody,
      confirmLabel: t.common.delete,
      destructive: true,
      errorText: (e) => errorText(e, t),
      onConfirm: async () => {
        await send('DELETE', `/admin/${kind}/${id}`)
        void queryClient.invalidateQueries({ queryKey: kind === 'categories' ? CATS : UNITS })
        toast.success(t.catalog.deleted)
      },
    })

  const roots = cats.data?.filter((c) => !c.parentId) ?? []
  const children = (id: string) => cats.data?.filter((c) => c.parentId === id) ?? []

  return (
    <>
      <TopBar title={t.catalog.title} />
      <PageBody className="max-w-5xl">
        <PageIntro title={t.catalog.title} description={t.catalog.description} />
        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t.catalog.categories}</CardTitle>
            <Button size="sm" onClick={() => setEditCat({ isActive: true, sortOrder: roots.length })}>
              <Plus />
              {t.catalog.addCategory}
            </Button>
          </CardHeader>
          <CardContent>
            {cats.isPending ? (
              <LoadingState />
            ) : cats.isError ? (
              <ErrorState onRetry={() => void cats.refetch()} />
            ) : (
              <ul className="flex flex-col divide-y">
                {roots.map((c) => (
                  <li key={c.id} className="py-2">
                    <CategoryRow c={c} onEdit={() => setEditCat(c)} onDelete={() => remove('categories', c.id, localized(c.name, locale))} />
                    <ul className="ml-8 flex flex-col">
                      {children(c.id).map((ch) => (
                        <li key={ch.id} className="py-1">
                          <CategoryRow c={ch} onEdit={() => setEditCat(ch)} onDelete={() => remove('categories', ch.id, localized(ch.name, locale))} />
                        </li>
                      ))}
                      <li>
                        <Button variant="link" size="sm" className="px-0" onClick={() => setEditCat({ parentId: c.id, isActive: true, sortOrder: children(c.id).length })}>
                          <Plus />
                          {t.catalog.addSub}
                        </Button>
                      </li>
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="gap-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t.catalog.units}</CardTitle>
            <Button size="sm" onClick={() => setEditUnit({})}>
              <Plus />
              {t.catalog.addUnit}
            </Button>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {units.data?.map((u) => (
                <li key={u.id} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{u.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {localized(u.name, 'lo')} · {localized(u.name, 'en')}
                  </span>
                  <span className="text-xs text-muted-foreground">{fill(t.catalog.productsCount, { n: u.productCount })}</span>
                  <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => setEditUnit(u)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t.common.delete} disabled={u.productCount > 0} onClick={() => remove('units', u.id, u.code)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </PageBody>

      <Dialog open={editCat !== null} onOpenChange={(o) => !o && setEditCat(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          {editCat && <CategoryForm key={editCat.id ?? 'new'} value={editCat} roots={roots} onDone={() => setEditCat(null)} />}
        </DialogContent>
      </Dialog>
      <Dialog open={editUnit !== null} onOpenChange={(o) => !o && setEditUnit(null)}>
        <DialogContent className="sm:max-w-md">{editUnit && <UnitForm key={editUnit.id ?? 'new'} value={editUnit} onDone={() => setEditUnit(null)} />}</DialogContent>
      </Dialog>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function CategoryRow({ c, onEdit, onDelete }: { c: Category; onEdit: () => void; onDelete: () => void }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
        {c.iconUrl ? <img src={c.iconUrl} alt="" className="size-6 object-contain" /> : <FolderTree className="size-4" />}
      </span>
      <span className={cn('min-w-0 flex-1', !c.isActive && 'opacity-60')}>
        <span className="block truncate text-sm font-medium">
          {localized(c.name, 'lo')} <span className="font-normal text-muted-foreground">· {localized(c.name, 'en')}</span>
        </span>
        <span className="text-xs text-muted-foreground">
          /{c.slug} · {fill(t.catalog.productsCount, { n: c.productCount })}
          {c.commissionRate !== null && ` · ${c.commissionRate}%`}
        </span>
      </span>
      {!c.isActive && <FlagBadge tone="muted">{t.catalog.hidden}</FlagBadge>}
      <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={onEdit}>
        <Pencil />
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label={t.common.delete} disabled={c.productCount > 0 || c.childCount > 0} onClick={onDelete}>
        <Trash2 />
      </Button>
    </div>
  )
}

function CategoryForm({ value, roots, onDone }: { value: Partial<Category>; roots: Category[]; onDone: () => void }) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [lo, setLo] = useState(value.name?.lo ?? '')
  const [en, setEn] = useState(value.name?.en ?? '')
  const [slug, setSlug] = useState(value.slug ?? '')
  const [parentId, setParentId] = useState(value.parentId ?? '')
  const [iconUrl, setIconUrl] = useState(value.iconUrl ?? '')
  const [imageUrl, setImageUrl] = useState(value.imageUrl ?? '')
  const [sortOrder, setSortOrder] = useState(String(value.sortOrder ?? 0))
  const [isActive, setIsActive] = useState(value.isActive ?? true)
  const [rate, setRate] = useState(value.commissionRate != null ? String(value.commissionRate) : '')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: { lo, en: en || undefined },
        slug,
        parentId: parentId || null,
        iconUrl: iconUrl || null,
        imageUrl: imageUrl || null,
        sortOrder: Number(sortOrder) || 0,
        isActive,
        commissionRate: rate.trim() === '' ? null : Number(rate),
      }
      return value.id ? send('PUT', `/admin/categories/${value.id}`, body) : send('POST', '/admin/categories', body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CATS })
      toast.success(t.common.saved)
      onDone()
    },
    onError: (e) => setError(errorText(e, t)),
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{value.id ? t.catalog.editCategory : value.parentId ? t.catalog.addSub : t.catalog.addCategory}</DialogTitle>
        <DialogDescription className="sr-only">{t.catalog.description}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field required id="lo" label={t.catalog.nameLo}>
          <Input id="lo" required maxLength={80} value={lo} onChange={(e) => setLo(e.target.value)} />
        </Field>
        <Field id="en" label={t.catalog.nameEn}>
          <Input id="en" maxLength={80} value={en} onChange={(e) => setEn(e.target.value)} />
        </Field>
        <Field required id="slug" label={t.catalog.slug} hint={t.catalog.slugHint}>
          <Input id="slug" required pattern="[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
        </Field>
        <Field id="parent" label={t.catalog.parent}>
          <Select value={parentId || 'root'} onValueChange={(v) => setParentId(v === 'root' ? '' : v)}>
            <SelectTrigger id="parent" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="root">{t.catalog.topLevel}</SelectItem>
              {roots
                .filter((r) => r.id !== value.id)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {localized(r.name, locale)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>
        <Field required id="sort" label={t.catalog.sortOrder}>
          <Input id="sort" type="number" min={0} max={1000} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
        </Field>
        <Field id="rate" label={t.catalog.commission} hint={t.catalog.commissionHint}>
          <Input id="rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
      </div>
      <Field id="icon" label={t.catalog.icon}>
        <ImageField value={iconUrl} onChange={setIconUrl} previewClassName="size-16" />
      </Field>
      <Field id="image" label={t.catalog.image}>
        <ImageField value={imageUrl} onChange={setImageUrl} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        {t.catalog.visible}
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
          {save.isPending && <LoaderCircle className="animate-spin" />}
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

function UnitForm({ value, onDone }: { value: Partial<Unit>; onDone: () => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [code, setCode] = useState(value.code ?? '')
  const [lo, setLo] = useState(value.name?.lo ?? '')
  const [en, setEn] = useState(value.name?.en ?? '')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => {
      const body = { code, name: { lo, en: en || undefined } }
      return value.id ? send('PUT', `/admin/units/${value.id}`, body) : send('POST', '/admin/units', body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: UNITS })
      toast.success(t.common.saved)
      onDone()
    },
    onError: (e) => setError(errorText(e, t)),
  })
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{value.id ? t.catalog.editUnit : t.catalog.addUnit}</DialogTitle>
        <DialogDescription>{t.catalog.codeHint}</DialogDescription>
      </DialogHeader>
      <Field required id="code" label={t.catalog.code}>
        <Input id="code" required pattern="[a-z0-9]{1,12}" value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} className="font-mono" />
      </Field>
      <Field required id="ulo" label={t.catalog.nameLo}>
        <Input id="ulo" required value={lo} onChange={(e) => setLo(e.target.value)} />
      </Field>
      <Field id="uen" label={t.catalog.nameEn}>
        <Input id="uen" value={en} onChange={(e) => setEn(e.target.value)} />
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
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

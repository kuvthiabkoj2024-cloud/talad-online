import { MEDIA_LIMITS, PRODUCT_RULES, type ProductSaveIntent } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { MoneyInput } from '@talad/ui/components/money-input'
import { Label, RequiredMark } from '@talad/ui/components/label'
import { Switch } from '@talad/ui/components/switch'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ImagePlus, Info, LoaderCircle, Shuffle, Trash2, TriangleAlert, Video, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { PageBody, TopBar } from '@/components/page-header'
import { ProductOptionsEditor } from '@/components/product-options'
import { SearchSelect } from '@/components/search-select'
import { ErrorState, LoadingState } from '@/components/states'
import { ProductStatusBadge } from '@/components/status-badge'
import { queryKeys, useCategories, useUnits } from '@/hooks/queries'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send, upload } from '@/lib/api'
import { fill, localized } from '@/lib/format'
import { autoSku, blankCell, combinations, comboKey, randomSku, type OptionGroup, type VariantCell } from '@/lib/product-options'
import type { MediaFile, ShopProductDetail } from '@/lib/types'

type ErrorKey = keyof Dict['editor']['errors']

/** A photo or video in the form: uploaded (has `key`) or still uploading (has `progress`). */
interface Media {
  uid: string
  key?: string
  url: string
  progress?: number
}

interface FormState {
  name: string
  description: string
  categoryId: string
  unitId: string
  sku: string
  price: string
  compareAtPrice: string
  stock: string
  lowStockThreshold: string
  hasOptions: boolean
  /** Up to two options (e.g. colour and size), values in order. */
  options: OptionGroup[]
  /** Price/stock/SKU per combination, by `comboKey` of its values. */
  cells: Record<string, VariantCell>
}

const uid = () => crypto.randomUUID()
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(/,/g, '')))
const isWhole = (s: string) => /^\d+$/.test(s.trim())

function fromProduct(p?: ShopProductDetail): FormState {
  return {
    name: p?.name ?? '',
    description: p?.description ?? '',
    categoryId: p?.categoryId ?? '',
    unitId: p?.unitId ?? '',
    sku: p?.sku ?? '',
    price: p ? String(p.price) : '',
    compareAtPrice: p?.compareAtPrice != null ? String(p.compareAtPrice) : '',
    stock: p ? String(p.stock) : '0',
    lowStockThreshold: p ? String(p.lowStockThreshold) : '5',
    hasOptions: (p?.variants.length ?? 0) > 0,
    options: (p?.options ?? []).map((o) => ({ uid: uid(), name: o.name, values: [...o.values] })),
    cells: Object.fromEntries(
      (p?.variants ?? []).map((v) => [
        comboKey((p?.options ?? []).map((o) => v.attributes[o.name] ?? '')),
        { id: v.id, sku: v.sku, autoSku: false, price: v.price != null ? String(v.price) : '', stock: String(v.stock) },
      ]),
    ),
  }
}

/** Colour and size, ready for values: what most sellers need. */
const startOptions = (t: Dict): OptionGroup[] => [
  { uid: uid(), name: t.editor.colour, values: [] },
  { uid: uid(), name: t.editor.size, values: [] },
]

const toMedia = (f: MediaFile): Media => ({ uid: f.key, key: f.key, url: f.url })

/** Create or edit a product (§3.3). `/products/new` or `/products/:id`. */
export function ProductEditorPage() {
  const { id } = useParams()
  const product = useQuery({
    queryKey: queryKeys.product(id ?? 'new'),
    queryFn: () => api<ShopProductDetail>(`/me/shop/products/${id}`),
    enabled: !!id,
  })
  const { t } = useI18n()
  const title = id ? t.editor.editTitle : t.editor.newTitle

  if (id && product.isPending) {
    return (
      <>
        <TopBar title={title} backTo="/products" />
        <LoadingState />
      </>
    )
  }
  if (id && product.isError) {
    return (
      <>
        <TopBar title={title} backTo="/products" />
        <PageBody>
          <ErrorState onRetry={() => void product.refetch()} />
        </PageBody>
      </>
    )
  }
  // Keyed so switching products resets the form.
  return <ProductForm key={id ?? 'new'} product={product.data} title={title} />
}

function ProductForm({ product, title }: { product?: ShopProductDetail; title: string }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const categories = useCategories()
  const units = useUnits()
  const formId = useId()

  const [form, setForm] = useState<FormState>(() => fromProduct(product))
  const [images, setImages] = useState<Media[]>(() => product?.images.map(toMedia) ?? [])
  const [video, setVideo] = useState<Media | null>(() => (product?.video ? toMedia(product.video) : null))
  const [errors, setErrors] = useState<Partial<Record<string, ErrorKey>>>({})
  const imageInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)

  /** Editing a field clears its error (and the shared options error). */
  const clearErrors = (...keys: string[]) =>
    setErrors((e) => (keys.some((k) => k in e) ? Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))) : e))
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    clearErrors(key, 'variants')
  }
  // Options with no values yet are left out of the combinations (and of the saved product).
  const filled = form.options.filter((o) => o.values.length)
  const combos = combinations(form.options)
  const cellFor = (values: string[]): VariantCell => form.cells[comboKey(values)] ?? blankCell()
  const skuFor = (values: string[]) => {
    const c = cellFor(values)
    return (c.autoSku ? autoSku(form.sku, values) : c.sku).trim()
  }
  const uploading = images.some((i) => !i.key) || (video !== null && !video.key)

  async function addImages(files: FileList | null) {
    if (!files?.length) return
    const room = MEDIA_LIMITS.maxImagesPerProduct - images.length
    if (files.length > room) toast.error(fill(t.editor.errors.tooManyImages, { max: MEDIA_LIMITS.maxImagesPerProduct }))
    for (const file of [...files].slice(0, Math.max(0, room))) {
      if (!(MEDIA_LIMITS.imageMimeTypes as readonly string[]).includes(file.type)) {
        toast.error(fill(t.editor.errors.fileType, { name: file.name }))
        continue
      }
      if (file.size > MEDIA_LIMITS.maxImageBytes) {
        toast.error(fill(t.editor.errors.fileSize, { name: file.name }))
        continue
      }
      const item: Media = { uid: uid(), url: URL.createObjectURL(file), progress: 0 }
      setImages((list) => [...list, item])
      clearErrors('images')
      upload<MediaFile>('/me/shop/products/images', file, (p) =>
        setImages((list) => list.map((i) => (i.uid === item.uid ? { ...i, progress: p } : i))),
      )
        .then((res) => setImages((list) => list.map((i) => (i.uid === item.uid ? { uid: item.uid, key: res.key, url: res.url } : i))))
        .catch((e) => {
          setImages((list) => list.filter((i) => i.uid !== item.uid))
          toast.error(errorText(e, t))
        })
    }
  }

  async function addVideo(file: File | undefined) {
    if (!file) return
    // Some browsers leave `type` empty (e.g. for .mov on Windows); the server checks the bytes anyway.
    const typeOk = file.type
      ? (MEDIA_LIMITS.videoMimeTypes as readonly string[]).includes(file.type)
      : /\.(mp4|m4v|mov|webm)$/i.test(file.name)
    if (!typeOk) return toast.error(fill(t.editor.errors.fileType, { name: file.name }))
    if (file.size > MEDIA_LIMITS.maxVideoBytes) return toast.error(fill(t.editor.errors.fileSize, { name: file.name }))
    const url = URL.createObjectURL(file)
    const seconds = await videoDuration(url)
    if (seconds > MEDIA_LIMITS.maxVideoSeconds + 0.5) {
      URL.revokeObjectURL(url)
      return toast.error(t.editor.errors.videoLength)
    }
    const item: Media = { uid: uid(), url, progress: 0 }
    setVideo(item)
    upload<MediaFile>('/me/shop/products/video', file, (p) => setVideo((v) => (v?.uid === item.uid ? { ...v, progress: p } : v)))
      .then((res) => setVideo((v) => (v?.uid === item.uid ? { uid: item.uid, key: res.key, url: res.url } : v)))
      .catch((e) => {
        setVideo((v) => (v?.uid === item.uid ? null : v))
        toast.error(errorText(e, t))
      })
  }

  function validate(intent: ProductSaveIntent): boolean {
    const e: Record<string, ErrorKey> = {}
    if (!form.name.trim()) e.name = 'name'
    if (!form.categoryId) e.categoryId = 'category'
    if (!form.unitId) e.unitId = 'unit'
    if (!(num(form.price) >= 0)) e.price = 'price'
    if (form.compareAtPrice.trim() && !(num(form.compareAtPrice) > num(form.price))) e.compareAtPrice = 'compareAt'
    if (!PRODUCT_RULES.skuPattern.test(form.sku.trim())) e.sku = 'sku'
    if (!isWhole(form.lowStockThreshold)) e.lowStockThreshold = 'stock'
    if (form.hasOptions) {
      const names = form.options.map((o) => o.name.trim().toLowerCase())
      if (names.some((n) => !n)) e.options = 'optionName'
      else if (form.options.some((o) => !o.values.length)) e.options = 'optionValues'
      else if (new Set(names).size !== names.length) e.options = 'optionsDuplicate'
      else if (combos.length > PRODUCT_RULES.maxVariants) e.options = 'tooManyVariants'
      for (const values of combos) {
        const k = comboKey(values)
        const c = cellFor(values)
        if (!PRODUCT_RULES.skuPattern.test(skuFor(values))) e[`sku-${k}`] = 'sku'
        if (c.price.trim() && !(num(c.price) >= 0)) e[`price-${k}`] = 'price'
        if (!isWhole(c.stock)) e[`stock-${k}`] = 'stock'
      }
      const skus = [form.sku, ...combos.map(skuFor)].map((x) => x.trim().toLowerCase())
      if (!e.options && new Set(skus).size !== skus.length) e.options = 'optionsDuplicate'
    } else if (!isWhole(form.stock)) {
      e.stock = 'stock'
    }
    if (intent === 'publish' && images.length === 0) e.images = 'images'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const save = useMutation({
    mutationFn: (intent: ProductSaveIntent) => {
      const options = form.hasOptions && combos.length > 0
      const body = {
        intent,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        categoryId: form.categoryId,
        unitId: form.unitId,
        sku: form.sku.trim(),
        price: num(form.price),
        compareAtPrice: form.compareAtPrice.trim() ? num(form.compareAtPrice) : null,
        stock: options ? 0 : Number(form.stock),
        lowStockThreshold: Number(form.lowStockThreshold),
        imageKeys: images.map((i) => i.key!),
        videoKey: video?.key ?? null,
        options: options ? filled.map((o) => ({ name: o.name.trim(), values: o.values })) : undefined,
        variants: options
          ? combos.map((values) => {
              const c = cellFor(values)
              return {
                id: c.id,
                attributes: Object.fromEntries(filled.map((o, i) => [o.name.trim(), values[i]])),
                sku: skuFor(values),
                price: c.price.trim() ? num(c.price) : null,
                stock: Number(c.stock),
              }
            })
          : [],
      }
      return product
        ? send<ShopProductDetail>('PUT', `/me/shop/products/${product.id}`, body)
        : send<ShopProductDetail>('POST', '/me/shop/products', body)
    },
    onSuccess: (saved) => {
      toast.success(
        saved.status === 'PUBLISHED' ? t.editor.savedPublished : saved.status === 'PENDING' ? t.editor.savedPending : t.editor.savedDraft,
      )
      queryClient.setQueryData(queryKeys.product(saved.id), saved)
      void queryClient.invalidateQueries({ queryKey: queryKeys.shop })
      navigate('/products')
    },
    onError: (e) => toast.error(errorText(e, t)),
  })

  function submit(intent: ProductSaveIntent) {
    if (uploading) return toast.error(t.editor.unsavedUploads)
    if (validate(intent)) save.mutate(intent)
    else toast.error(t.common.saveError)
  }

  // Categories with sub-categories become groups (the parent first); the rest stay together.
  const categoryGroups = (() => {
    const item = (c: { id: string; name: Record<string, string> | object; slug?: string }, indent = false) => ({
      value: c.id,
      label: localized(c.name as never, locale),
      keywords: [...Object.values(c.name as Record<string, string>), ...(c.slug ? [c.slug] : [])],
      indent,
    })
    const all = categories.data ?? []
    return [
      { items: all.filter((c) => !c.children.length).map((c) => item(c)) },
      ...all.filter((c) => c.children.length).map((c) => ({ label: localized(c.name, locale), items: [item(c), ...c.children.map((child) => item(child, true))] })),
    ].filter((g) => g.items.length)
  })()
  const err = (key: string) => errors[key] && <p className="text-sm text-destructive">{t.editor.errors[errors[key]!]}</p>
  const field = (key: string) => (errors[key] ? { 'aria-invalid': true as const } : {})
  const live = product?.status === 'PUBLISHED'

  return (
    <>
      <TopBar title={title} backTo="/products" />
      <PageBody className="pb-28">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="hidden text-2xl font-semibold tracking-tight md:block">{title}</h2>
          {product && <ProductStatusBadge status={product.status} />}
        </div>

        {product?.status === 'REJECTED' && (
          <Notice tone="danger">{fill(t.editor.rejectedNote, { reason: product.rejectionReason ?? '—' })}</Notice>
        )}
        {product?.status === 'PENDING' && <Notice>{t.editor.pendingNote}</Notice>}
        {!product && <Notice>{t.editor.moderationNote}</Notice>}

        {/* Full width, two cards per row on wide screens; options take the whole row. */}
        <form
          id={formId}
          className="grid items-start gap-5 xl:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            submit('publish')
          }}
        >
          {/* Photos and video: same-size square tiles, same card height, drop files on either. */}
          <Card className="xl:self-stretch">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t.editor.photos}
                <RequiredMark />
              </CardTitle>
              <CardDescription>{fill(t.editor.photosHint, { max: MEDIA_LIMITS.maxImagesPerProduct })}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <DropZone label={t.editor.dropNow} hint={t.editor.dropPhotos} onFiles={(files) => void addImages(files)}>
                <div className="flex flex-wrap gap-3">
                  {images.map((img, i) => (
                    <div
                      key={img.uid}
                      draggable={!!img.key}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData(PHOTO_DRAG, String(i))
                      }}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes(PHOTO_DRAG)) e.preventDefault()
                      }}
                      onDrop={(e) => {
                        const from = Number(e.dataTransfer.getData(PHOTO_DRAG))
                        if (!e.dataTransfer.types.includes(PHOTO_DRAG) || Number.isNaN(from)) return
                        e.preventDefault()
                        e.stopPropagation()
                        setImages((l) => move(l, from, i))
                      }}
                      className={cn(TILE, 'group relative cursor-grab overflow-hidden rounded-xl border bg-muted active:cursor-grabbing')}
                    >
                      <img src={img.url} alt="" draggable={false} className="size-full object-cover" />
                      {i === 0 && (
                        <span className="absolute top-1.5 left-1.5 rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          {t.editor.cover}
                        </span>
                      )}
                      {img.progress !== undefined && <Progress value={img.progress} />}
                      <div className="absolute inset-x-1.5 bottom-1.5 flex justify-between opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                        <span className="flex gap-1">
                          <IconButton label={t.editor.moveLeft} disabled={i === 0} onClick={() => setImages((l) => swap(l, i, i - 1))}>
                            <ChevronLeft />
                          </IconButton>
                          <IconButton label={t.editor.moveRight} disabled={i === images.length - 1} onClick={() => setImages((l) => swap(l, i, i + 1))}>
                            <ChevronRight />
                          </IconButton>
                        </span>
                        <IconButton label={t.editor.remove} onClick={() => setImages((l) => l.filter((x) => x.uid !== img.uid))}>
                          <X />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                  {images.length < MEDIA_LIMITS.maxImagesPerProduct && (
                    <button
                      type="button"
                      onClick={() => imageInput.current?.click()}
                      className={cn(
                        TILE,
                        'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary',
                        errors.images && 'border-destructive text-destructive',
                      )}
                    >
                      <ImagePlus className="size-6" />
                      {t.editor.addPhotos}
                    </button>
                  )}
                </div>
              </DropZone>
              <input
                ref={imageInput}
                type="file"
                accept={MEDIA_LIMITS.imageMimeTypes.join(',')}
                multiple
                hidden
                onChange={(e) => {
                  void addImages(e.target.files)
                  e.target.value = ''
                }}
              />
              {err('images')}
            </CardContent>
          </Card>

          <Card className="xl:self-stretch">
            <CardHeader>
              <CardTitle>{t.editor.video}</CardTitle>
              <CardDescription>
                {fill(t.editor.videoHint, {
                  seconds: MEDIA_LIMITS.maxVideoSeconds,
                  mb: MEDIA_LIMITS.maxVideoBytes / 1024 / 1024,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-3">
              <DropZone label={t.editor.dropNow} hint={t.editor.dropVideo} onFiles={(files) => void addVideo(files[0])}>
                <div className="flex flex-wrap items-end gap-3">
                  {video ? (
                    <>
                      <div className={cn(TILE, 'group relative overflow-hidden rounded-xl border bg-black')}>
                        <video src={video.url} controls playsInline muted preload="metadata" className="size-full object-cover" />
                        {video.progress !== undefined && (
                          // At 100% the browser is done; the API is still copying it to storage.
                          <Progress value={video.progress} label={video.progress >= 1 ? t.editor.processing : t.editor.uploading} />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={video.progress !== undefined} onClick={() => videoInput.current?.click()}>
                          {t.editor.replaceVideo}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setVideo(null)}>
                          <Trash2 />
                          {t.editor.remove}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => videoInput.current?.click()}
                      className={cn(
                        TILE,
                        'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary',
                      )}
                    >
                      <Video className="size-6" />
                      {t.editor.addVideo}
                    </button>
                  )}
                </div>
              </DropZone>
              <input
                ref={videoInput}
                type="file"
                accept={[...MEDIA_LIMITS.videoMimeTypes, '.mp4', '.m4v', '.mov', '.webm'].join(',')}
                hidden
                onChange={(e) => {
                  void addVideo(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </CardContent>
          </Card>

          <Card className="xl:self-stretch">
            <CardHeader>
              <CardTitle>{t.editor.basics}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field label={t.editor.name} htmlFor="name" required error={err('name')}>
                <Input
                  id="name"
                  value={form.name}
                  maxLength={PRODUCT_RULES.nameMax}
                  placeholder={t.editor.namePlaceholder}
                  onChange={(e) => set('name', e.target.value)}
                  {...field('name')}
                />
              </Field>
              <Field label={t.editor.descriptionLabel} htmlFor="description" hint={t.common.optional}>
                <Textarea
                  id="description"
                  rows={5}
                  value={form.description}
                  maxLength={PRODUCT_RULES.descriptionMax}
                  placeholder={t.editor.descriptionPlaceholder}
                  onChange={(e) => set('description', e.target.value)}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t.editor.category} htmlFor="category" required error={err('categoryId')}>
                  <SearchSelect
                    id="category"
                    value={form.categoryId}
                    onChange={(v) => set('categoryId', v)}
                    invalid={!!errors.categoryId}
                    placeholder={t.editor.chooseCategory}
                    searchPlaceholder={t.editor.searchCategory}
                    empty={t.editor.noMatches}
                    groups={categoryGroups}
                  />
                </Field>
                <Field label={t.editor.unit} htmlFor="unit" required error={err('unitId')}>
                  <SearchSelect
                    id="unit"
                    value={form.unitId}
                    onChange={(v) => set('unitId', v)}
                    invalid={!!errors.unitId}
                    placeholder={t.editor.chooseUnit}
                    searchPlaceholder={t.editor.searchUnit}
                    empty={t.editor.noMatches}
                    groups={[
                      {
                        items: (units.data ?? []).map((u) => ({
                          value: u.id,
                          label: localized(u.name, locale),
                          hint: u.code,
                          keywords: [u.code, ...Object.values(u.name)],
                        })),
                      },
                    ]}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:self-stretch">
            <CardHeader>
              <CardTitle>{t.editor.pricing}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label={t.editor.price} htmlFor="price" required error={err('price')}>
                <MoneyInput id="price" value={form.price} onValueChange={(v) => set('price', v)} {...field('price')} />
              </Field>
              <Field label={t.editor.compareAt} htmlFor="compareAt" hint={t.editor.compareAtHint} error={err('compareAtPrice')}>
                <MoneyInput id="compareAt" value={form.compareAtPrice} onValueChange={(v) => set('compareAtPrice', v)} {...field('compareAtPrice')} />
              </Field>
              <Field label={t.editor.sku} htmlFor="sku" required hint={t.editor.skuHint} error={err('sku')}>
                {/* Type your own code, or tap to make one (8 letters and numbers). */}
                <div className="relative">
                  <Input id="sku" value={form.sku} className="pr-10 font-mono" onChange={(e) => set('sku', e.target.value)} {...field('sku')} />
                  <button
                    type="button"
                    onClick={() => set('sku', randomSku())}
                    aria-label={t.editor.randomSku}
                    title={t.editor.randomSku}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
                  >
                    <Shuffle className="size-4" />
                  </button>
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label={t.editor.stock} htmlFor="stock" required={!form.hasOptions} error={err('stock')}>
                  <Input
                    id="stock"
                    inputMode="numeric"
                    disabled={form.hasOptions}
                    placeholder={form.hasOptions ? '—' : undefined}
                    value={form.hasOptions ? '' : form.stock}
                    onChange={(e) => set('stock', e.target.value)}
                    {...field('stock')}
                  />
                  {form.hasOptions && <p className="text-xs text-muted-foreground">{t.editor.stockFromOptions}</p>}
                </Field>
                <Field label={t.editor.lowStockAt} required htmlFor="lowStock" error={err('lowStockThreshold')}>
                  <Input
                    id="lowStock"
                    inputMode="numeric"
                    value={form.lowStockThreshold}
                    onChange={(e) => set('lowStockThreshold', e.target.value)}
                    {...field('lowStockThreshold')}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div className="space-y-1">
                <CardTitle>{t.editor.optionsTitle}</CardTitle>
                <CardDescription>{t.editor.optionsToggle}</CardDescription>
              </div>
              <Switch
                checked={form.hasOptions}
                aria-label={t.editor.optionsToggle}
                onCheckedChange={(on) => {
                  setForm((f) => ({ ...f, hasOptions: on, options: on && f.options.length === 0 ? startOptions(t) : f.options }))
                  clearErrors('options')
                }}
              />
            </CardHeader>
            {form.hasOptions && (
              <CardContent>
                <ProductOptionsEditor
                  options={form.options}
                  onOptions={(options) => {
                    setForm((f) => ({ ...f, options }))
                    clearErrors('options')
                  }}
                  cells={form.cells}
                  onCells={(cells) => {
                    setForm((f) => ({ ...f, cells }))
                    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !/^(sku|price|stock)-/.test(k))))
                  }}
                  baseSku={form.sku}
                  basePrice={form.price}
                  errors={{
                    ...Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v && t.editor.errors[v]])),
                  }}
                />
                {Object.keys(errors).some((k) => /^(sku|price|stock)-/.test(k)) && <p className="mt-3 text-sm text-destructive">{t.common.saveError}</p>}
              </CardContent>
            )}
          </Card>
        </form>
      </PageBody>

      {/* Actions stay in reach while scrolling a long form. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur md:sticky md:px-6">
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="flex-1 md:flex-none" disabled={save.isPending} onClick={() => submit('draft')}>
            {save.isPending && save.variables === 'draft' && <LoaderCircle className="animate-spin" />}
            {t.editor.saveDraft}
          </Button>
          <Button type="submit" form={formId} className="flex-1 md:flex-none" disabled={save.isPending}>
            {save.isPending && save.variables === 'publish' && <LoaderCircle className="animate-spin" />}
            {live ? t.editor.saveChanges : t.editor.publish}
          </Button>
        </div>
      </div>
    </>
  )
}

/** Photo and video tiles share one size. */
const TILE = 'size-28 shrink-0 sm:size-32'
/** Drag data type for reordering photos (files from the computer carry "Files" instead). */
const PHOTO_DRAG = 'application/x-talad-photo'

/** Moves the item at `from` to `to` (drag to reorder). */
function move<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * Drop files from the computer onto this area (the card highlights while dragging over it).
 * Dragging a photo to reorder it isn't a file drop, so it's left to the tiles.
 */
function DropZone({ label, hint, onFiles, children }: { label: string; hint: string; onFiles: (files: FileList) => void; children: React.ReactNode }) {
  const [over, setOver] = useState(false)
  const hasFiles = (e: React.DragEvent) => e.dataTransfer.types.includes('Files')
  return (
    <div
      onDragEnter={(e) => {
        if (hasFiles(e)) setOver(true)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setOver(true)
      }}
      onDragLeave={(e) => {
        // Only when the pointer leaves the zone, not when it moves onto a child.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOver(false)
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files)
      }}
      className={cn('relative flex flex-1 flex-col gap-3 rounded-2xl p-1 transition-colors', over && 'bg-brand-soft outline-2 outline-primary outline-dashed')}
    >
      {children}
      <p className="text-xs text-muted-foreground">{hint}</p>
      {over && (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-brand-soft/80 text-sm font-semibold text-primary">{label}</span>
      )}
    </div>
  )
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list]
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

function videoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    // Some files (e.g. WebM recorded in a browser) report Infinity until played: let the upload decide.
    v.onloadedmetadata = () => resolve(Number.isFinite(v.duration) ? v.duration : 0)
    // Unreadable here (e.g. some MOV codecs): let the upload decide.
    v.onerror = () => resolve(0)
    v.src = url
  })
}

function errorText(e: unknown, t: Dict): string {
  if (e instanceof ApiError && e.code && e.code in t.editor.errors) return t.editor.errors[e.code as ErrorKey]
  return t.common.saveError
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: React.ReactNode
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} required={required}>
        {label}
      </Label>
      {children}
      {error || (hint && <p className="text-xs text-muted-foreground">{hint}</p>)}
    </div>
  )
}

function Notice({ tone = 'info', children }: { tone?: 'info' | 'danger'; children: React.ReactNode }) {
  const Icon = tone === 'danger' ? TriangleAlert : Info
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl border p-3 text-sm',
        tone === 'danger'
          ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100'
          : 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm disabled:opacity-30 [&_svg]:size-4"
    >
      {children}
    </button>
  )
}

function Progress({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100)
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 px-3 text-xs text-white">
      <LoaderCircle className="size-5 animate-spin" />
      {label && <span>{fill(label, { pct })}</span>}
      <span className="h-1 w-full overflow-hidden rounded-full bg-white/30">
        <span className="block h-full bg-white transition-[width]" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}

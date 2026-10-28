import { formatPhone, KYC_DOCUMENT_TYPES, normalizePhone, REQUIRED_KYC_DOCUMENTS, SHOP_RULES, slugify, type KycDocumentType } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent } from '@talad/ui/components/card'
import { Input } from '@talad/ui/components/input'
import { Label, RequiredMark } from '@talad/ui/components/label'
import { Textarea } from '@talad/ui/components/textarea'
import { cn } from '@talad/ui/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BadgeCheck,
  CheckCircle2,
  Circle,
  CircleAlert,
  ClipboardList,
  ExternalLink,
  FileText,
  LoaderCircle,
  MapPin,
  Rocket,
  ShieldCheck,
  Store,
  TriangleAlert,
  Upload,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ME_KEY, useAuth } from '@/auth/context'
import { AccountAvatar, AccountMenu } from '@/components/account-menu'
import { ErrorState, LoadingState } from '@/components/states'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, getToken, send, upload } from '@/lib/api'
import { fill, storefrontUrl } from '@/lib/format'
import type { Account, ShopStatus } from '@/lib/types'

type ErrorKey = keyof Dict['register']['errors']

/** Mirrors `ShopApplication` (services/api shops). */
interface ShopApplication {
  id: string
  status: ShopStatus
  rejectionReason: string | null
  name: string
  slug: string
  description: string | null
  ownerName: string
  email: string | null
  phone: string
  address: string | null
  documents: { id: string; type: KycDocumentType; key: string }[]
}

/** One uploaded (or uploading) document per type. `id` = already part of the application. */
interface Doc {
  key?: string
  id?: string
  name?: string
  localUrl?: string
  progress?: number
}

const APPLICATION_KEY = ['shop', 'application'] as const
const EDITABLE: ShopStatus[] = ['PENDING', 'REJECTED']

/**
 * Open a shop (§3.1): business details, pickup address and KYC documents. The shop is
 * PENDING until Taladonline approves it; pending or rejected applications can be edited.
 */
export function RegisterPage() {
  const { account } = useAuth()
  const { t } = useI18n()
  const existing = useQuery({
    queryKey: APPLICATION_KEY,
    queryFn: () => api<ShopApplication>('/me/shop/application'),
    enabled: !!account?.shop,
  })
  if (!account) return null
  if (account.shop && !EDITABLE.includes(account.shop.status)) return <Navigate to="/" replace />

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Store className="size-4.5" strokeWidth={2.25} />
        </span>
        <span className="flex-1 truncate font-semibold">
          {t.app.brand} <span className="text-muted-foreground">{t.app.name}</span>
        </span>
        <AccountMenu
          trigger={
            <button type="button" className="rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <AccountAvatar account={account} className="size-8" />
            </button>
          }
        />
      </header>
      {account.shop && existing.isPending ? (
        <LoadingState className="py-24" />
      ) : account.shop && existing.isError ? (
        <ErrorState onRetry={() => void existing.refetch()} className="mx-auto mt-10 max-w-md" />
      ) : (
        <ApplicationForm account={account} application={existing.data} />
      )}
    </div>
  )
}

function ApplicationForm({ account, application }: { account: Account; application?: ShopApplication }) {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [name, setName] = useState(application?.name ?? '')
  const [slug, setSlug] = useState(application?.slug ?? '')
  const [slugEdited, setSlugEdited] = useState(!!application)
  const [description, setDescription] = useState(application?.description ?? '')
  const [ownerName, setOwnerName] = useState(application?.ownerName ?? account.name)
  const [email, setEmail] = useState(application?.email ?? account.email ?? '')
  const [phone, setPhone] = useState(formatPhone(application?.phone ?? account.phone ?? '') || '')
  const [address, setAddress] = useState(application?.address ?? '')
  const [docs, setDocs] = useState<Partial<Record<KycDocumentType, Doc>>>(() =>
    Object.fromEntries((application?.documents ?? []).map((d) => [d.type, { key: d.key, id: d.id }])),
  )
  const [terms, setTerms] = useState(!!application)
  const [errors, setErrors] = useState<Partial<Record<string, ErrorKey>>>({})
  const [submitting, setSubmitting] = useState(false)

  // Web address follows the name until the seller edits it (Lao-only names give nothing to follow).
  const effectiveSlug = slugEdited ? slug : slugify(name)
  const slugCheck = useSlugCheck(effectiveSlug)
  const clear = (key: string) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e))

  async function uploadDoc(type: KycDocumentType, file: File | undefined) {
    if (!file) return
    if (!(SHOP_RULES.kycMimeTypes as readonly string[]).includes(file.type)) return toast.error(t.register.errors.INVALID_DOCUMENT)
    if (file.size > SHOP_RULES.kycMaxBytes) return toast.error(t.register.errors.FILE_TOO_LARGE)
    const localUrl = URL.createObjectURL(file)
    setDocs((d) => ({ ...d, [type]: { name: file.name, localUrl, progress: 0 } }))
    clear('documents')
    try {
      const res = await upload<{ key: string }>('/me/shop/application/documents', file, (p) =>
        setDocs((d) => (d[type]?.localUrl === localUrl ? { ...d, [type]: { ...d[type], progress: p } } : d)),
      )
      setDocs((d) => (d[type]?.localUrl === localUrl ? { ...d, [type]: { key: res.key, name: file.name, localUrl } } : d))
    } catch (e) {
      setDocs((d) => {
        const { [type]: _, ...rest } = d
        return rest
      })
      toast.error(errorText(e, t))
    }
  }

  /** Saved documents are private: fetch with the session, then open the file. */
  async function viewDoc(doc: Doc) {
    if (doc.localUrl) return void window.open(doc.localUrl, '_blank', 'noopener')
    const tab = window.open('', '_blank')
    const res = await fetch(`${import.meta.env.VITE_API_URL}/me/shop/application/documents/${doc.id}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (!res.ok || !tab) return tab?.close()
    tab.location.href = URL.createObjectURL(await res.blob())
  }

  async function submit() {
    const e: Record<string, ErrorKey> = {}
    if (name.trim().length < SHOP_RULES.nameMin) e.name = 'name'
    if (!SHOP_RULES.slugPattern.test(effectiveSlug) || slugCheck.data?.available === false) e.slug = 'slug'
    if (ownerName.trim().length < 2) e.ownerName = 'ownerName'
    // Email is optional; when given it must look like one.
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'email'
    if (!normalizePhone(phone)) e.phone = 'phone'
    if (address.trim().length < 5) e.address = 'address'
    if (!docs.NATIONAL_ID?.key) e.documents = 'idRequired'
    else if (!docs.ID_SELFIE?.key) e.documents = 'selfieRequired'
    if (!terms) e.terms = 'terms'
    setErrors(e)
    if (Object.keys(e).length) {
      document.querySelector('[aria-invalid=true], [data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    if (Object.values(docs).some((d) => d && !d.key)) return toast.error(t.editor.unsavedUploads)

    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim() || undefined,
        ownerName: ownerName.trim(),
        email: email.trim() || null,
        phone,
        address: address.trim(),
        documents: KYC_DOCUMENT_TYPES.flatMap((type) => (docs[type]?.key ? [{ type, key: docs[type]!.key! }] : [])),
        acceptTerms: true,
      }
      await send(application ? 'PUT' : 'POST', '/me/shop/application', body)
      toast.success(t.register.submitted)
      await queryClient.invalidateQueries({ queryKey: ME_KEY })
      await queryClient.invalidateQueries({ queryKey: ['shop'] })
      navigate('/', { replace: true })
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined
      if (code === 'SLUG_TAKEN') setErrors({ slug: 'SLUG_TAKEN' })
      else if (code === 'EMAIL_TAKEN') setErrors({ email: 'EMAIL_TAKEN' })
      else if (code === 'PHONE_TAKEN' || code === 'INVALID_PHONE') setErrors({ phone: code })
      toast.error(errorText(err, t))
    } finally {
      setSubmitting(false)
    }
  }

  const err = (key: string) =>
    errors[key] && (
      <p data-error className="text-sm text-destructive">
        {t.register.errors[errors[key]!]}
      </p>
    )
  const invalid = (key: string) => (errors[key] ? { 'aria-invalid': true as const } : {})

  const checks = [
    { label: t.register.checkShop, done: name.trim().length >= SHOP_RULES.nameMin && SHOP_RULES.slugPattern.test(effectiveSlug) && slugCheck.data?.available !== false },
    { label: t.register.checkContact, done: ownerName.trim().length >= 2 && (!email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) && !!normalizePhone(phone) },
    { label: t.register.checkAddress, done: address.trim().length >= 5 },
    { label: t.register.checkId, done: REQUIRED_KYC_DOCUMENTS.every((type) => !!docs[type]?.key) },
    { label: t.register.checkTerms, done: terms },
  ]
  const done = checks.filter((c) => c.done).length
  const submitLabel = application ? t.register.resubmit : t.register.submit

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Hero title={application ? t.register.editTitle : t.register.title} />

      <div className="relative z-10 mx-auto -mt-10 grid w-full max-w-6xl gap-6 px-4 pb-28 md:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pb-12">
        <div className="flex min-w-0 flex-col gap-5">
          {application?.status === 'REJECTED' && (
            <Banner tone="danger">{fill(t.register.rejected, { reason: application.rejectionReason ?? '—' })}</Banner>
          )}
          {application?.status === 'PENDING' && <Banner>{t.register.pending}</Banner>}

          <Section n={1} icon={Store} title={t.register.shopSection}>
            <Field label={t.register.shopName} htmlFor="shopName" required error={err('name')}>
              <Input
                id="shopName"
                value={name}
                maxLength={SHOP_RULES.nameMax}
                placeholder={t.register.shopNamePlaceholder}
                onChange={(e) => {
                  setName(e.target.value)
                  clear('name')
                  if (!slugEdited) clear('slug')
                }}
                {...invalid('name')}
              />
            </Field>
            <Field label={t.register.slug} htmlFor="slug" required error={err('slug')}>
              <div
                className={cn(
                  'flex items-center overflow-hidden rounded-md border border-input focus-within:ring-[3px] focus-within:ring-ring/50',
                  errors.slug && 'border-destructive',
                )}
              >
                <span className="border-r bg-muted px-3 py-2 text-sm whitespace-nowrap text-muted-foreground">taladonline.com/s/</span>
                <input
                  id="slug"
                  value={effectiveSlug}
                  maxLength={40}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={(e) => {
                    setSlugEdited(true)
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
                    clear('slug')
                  }}
                  className="h-9 min-w-0 flex-1 bg-transparent px-3 text-sm outline-none"
                />
              </div>
              {!errors.slug && <SlugStatus slug={effectiveSlug} check={slugCheck} />}
            </Field>
            <Field label={t.register.description} htmlFor="description" hint={t.common.optional}>
              <Textarea
                id="description"
                rows={3}
                value={description}
                maxLength={SHOP_RULES.descriptionMax}
                placeholder={t.register.descriptionPlaceholder}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </Section>

          <Section n={2} icon={UserRound} title={t.register.contactSection}>
            <Field label={t.register.ownerName} htmlFor="ownerName" required hint={t.register.ownerNameHint} error={err('ownerName')}>
              <Input id="ownerName" value={ownerName} maxLength={100} onChange={(e) => (setOwnerName(e.target.value), clear('ownerName'))} {...invalid('ownerName')} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.register.email} htmlFor="email" hint={t.common.optional} error={err('email')}>
                <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => (setEmail(e.target.value), clear('email'))} {...invalid('email')} />
              </Field>
              <Field label={t.register.phone} htmlFor="bizPhone" required error={err('phone')}>
                <Input id="bizPhone" type="tel" inputMode="tel" value={phone} onChange={(e) => (setPhone(e.target.value), clear('phone'))} {...invalid('phone')} />
              </Field>
            </div>
          </Section>

          <Section n={3} icon={MapPin} title={t.register.addressSection} hint={t.register.addressHint}>
            <Field label={t.register.address} htmlFor="address" required error={err('address')}>
              <Textarea
                id="address"
                rows={3}
                value={address}
                maxLength={SHOP_RULES.addressMax}
                onChange={(e) => (setAddress(e.target.value), clear('address'))}
                {...invalid('address')}
              />
            </Field>
          </Section>

          <Section n={4} icon={ShieldCheck} title={t.register.docsSection} hint={t.register.docsHint}>
            <div className="grid gap-3 sm:grid-cols-2">
              {KYC_DOCUMENT_TYPES.map((type) => (
                <DocumentRow
                  key={type}
                  type={type}
                  doc={docs[type]}
                  invalid={REQUIRED_KYC_DOCUMENTS.includes(type) && !docs[type]?.key && !!errors.documents}
                  onFile={(f) => void uploadDoc(type, f)}
                  onView={(d) => void viewDoc(d)}
                  onRemove={() =>
                    setDocs((d) => {
                      const { [type]: _, ...rest } = d
                      return rest
                    })
                  }
                />
              ))}
            </div>
            {err('documents')}
          </Section>

          <Card className="py-4">
            <CardContent className="flex flex-col gap-1.5 px-4 sm:px-6">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={terms}
                  onChange={(e) => (setTerms(e.target.checked), clear('terms'))}
                  className="mt-0.5 size-4 shrink-0 accent-(--primary)"
                />
                <span>
                  {t.register.terms} <RequiredMark />{' '}
                  <a href={storefrontUrl.terms(locale)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                    {t.register.termsLink}
                    <ExternalLink className="size-3" />
                  </a>
                </span>
              </label>
              {err('terms')}
            </CardContent>
          </Card>
        </div>

        {/* Desktop: live preview, progress and the submit button stay in view. */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 flex flex-col gap-4">
            <ShopPreview name={name} slug={effectiveSlug} description={description} />
            <Card className="gap-4 py-5">
              <CardContent className="flex flex-col gap-4 px-5">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <ClipboardList className="size-4 text-primary" />
                      {t.register.checklist}
                    </p>
                    <span className="text-xs text-muted-foreground tabular-nums">{fill(t.register.progress, { done, total: checks.length })}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${(done / checks.length) * 100}%` }} />
                  </div>
                </div>
                <ul className="flex flex-col gap-2 text-sm">
                  {checks.map((c) => (
                    <li key={c.label} className={cn('flex items-center gap-2', c.done ? 'text-foreground' : 'text-muted-foreground')}>
                      {c.done ? <CheckCircle2 className="size-4 shrink-0 text-primary" /> : <Circle className="size-4 shrink-0" />}
                      {c.label}
                    </li>
                  ))}
                </ul>
                <Button type="submit" size="lg" className="w-full" disabled={submitting}>
                  {submitting && <LoaderCircle className="animate-spin" />}
                  {submitLabel}
                </Button>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {/* Phones and tablets: progress + submit pinned to the bottom. */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <span className="hidden text-xs text-muted-foreground tabular-nums sm:block">{fill(t.register.progress, { done, total: checks.length })}</span>
          <Button type="submit" size="lg" className="flex-1 sm:ml-auto sm:flex-none" disabled={submitting}>
            {submitting && <LoaderCircle className="animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}

/** Green band with the title and the three steps to selling. */
function Hero({ title }: { title: string }) {
  const { t } = useI18n()
  const steps: { icon: LucideIcon; title: string; body: string }[] = [
    { icon: ClipboardList, title: t.register.steps.apply, body: t.register.steps.applyBody },
    { icon: BadgeCheck, title: t.register.steps.review, body: t.register.steps.reviewBody },
    { icon: Rocket, title: t.register.steps.sell, body: t.register.steps.sellBody },
  ]
  return (
    <section className="relative isolate overflow-hidden bg-linear-to-br from-[oklch(0.52_0.13_145)] to-[oklch(0.36_0.09_152)] text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-24 -right-16 size-80 rounded-full border-[2.5rem] border-white/8" />
        <div className="absolute inset-0 bg-[radial-gradient(oklch(1_0_0/0.12)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      </div>
      <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 md:px-6 md:pt-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
          <BadgeCheck className="size-3.5" />
          {t.register.free}
        </span>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/80 sm:text-base">{t.register.subtitle}</p>
        {/* Phones: three compact icon + title tiles in a row; descriptions from sm up. */}
        <ol className="mt-6 flex gap-2 sm:grid sm:grid-cols-3 sm:gap-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-2xl bg-white/10 px-2 py-3 text-center ring-1 ring-white/15 backdrop-blur-sm sm:flex-row sm:items-start sm:gap-3 sm:p-3.5 sm:text-left"
            >
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <s.icon className="size-4.5" />
                <span className="absolute -top-1.5 -right-1.5 flex size-4.5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-primary">{i + 1}</span>
              </span>
              <span>
                <span className="block text-xs leading-snug font-semibold sm:text-sm">{s.title}</span>
                <span className="hidden text-xs text-white/75 sm:block">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Section({ n, icon: Icon, title, hint, children }: { n: number; icon: LucideIcon; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-5 py-5 sm:py-6">
      <div className="flex items-start gap-3 px-4 sm:px-6">
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
          <Icon className="size-5" />
          <span className="absolute -top-1.5 -left-1.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground ring-2 ring-card">{n}</span>
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <CardContent className="flex flex-col gap-4 px-4 sm:px-6">{children}</CardContent>
    </Card>
  )
}

/** The storefront shop card, filled in as the seller types. */
function ShopPreview({ name, slug, description }: { name: string; slug: string; description: string }) {
  const { t } = useI18n()
  const initial = name.trim().charAt(0).toUpperCase()
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="h-16 bg-linear-to-br from-[oklch(0.62_0.12_145)] to-[oklch(0.42_0.1_150)]" />
      <div className="flex flex-col gap-2 px-5 pb-5">
        <span className="-mt-7 flex size-14 items-center justify-center rounded-2xl bg-card text-xl font-bold text-primary shadow-md ring-4 ring-card">
          {initial || <Store className="size-6" />}
        </span>
        <div>
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{name.trim() || t.register.previewName}</span>
            <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">{t.register.newShop}</span>
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">taladonline.com/s/{slug || '…'}</p>
        </div>
        <p className="line-clamp-2 text-sm text-muted-foreground">{description.trim() || t.register.previewAbout}</p>
        <p className="border-t pt-2 text-[11px] tracking-wide text-muted-foreground uppercase">
          {t.register.preview} · {t.register.previewHint}
        </p>
      </div>
    </Card>
  )
}

/** Debounced "is this web address free?" while typing. */
function useSlugCheck(slug: string) {
  const [debounced, setDebounced] = useState(slug)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(slug), 400)
    return () => clearTimeout(id)
  }, [slug])
  return useQuery({
    queryKey: ['slug-check', debounced],
    queryFn: () => api<{ available: boolean; valid: boolean }>(`/me/shop/application/slug?slug=${encodeURIComponent(debounced)}`),
    enabled: SHOP_RULES.slugPattern.test(debounced) && debounced === slug,
    staleTime: 10_000,
  })
}

function SlugStatus({ slug, check }: { slug: string; check: ReturnType<typeof useSlugCheck> }) {
  const { t } = useI18n()
  if (!slug) return <p className="text-xs text-muted-foreground">{t.register.slugHint}</p>
  if (!SHOP_RULES.slugPattern.test(slug)) return <p className="text-xs text-muted-foreground">{t.register.slugInvalid}</p>
  if (!check.data || check.isFetching) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <LoaderCircle className="size-3 animate-spin" />
        {t.register.slugChecking}
      </p>
    )
  }
  return check.data.available ? (
    <p className="flex items-center gap-1 text-xs text-primary">
      <CheckCircle2 className="size-3.5" />
      {t.register.slugFree}
    </p>
  ) : (
    <p className="flex items-center gap-1 text-xs text-destructive">
      <CircleAlert className="size-3.5" />
      {t.register.slugTaken}
    </p>
  )
}

function DocumentRow({
  type,
  doc,
  invalid,
  onFile,
  onView,
  onRemove,
}: {
  type: KycDocumentType
  doc?: Doc
  invalid: boolean
  onFile: (f: File | undefined) => void
  onView: (d: Doc) => void
  onRemove: () => void
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const uploading = doc && !doc.key
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border-2 border-dashed p-3.5 transition-colors',
        doc?.key ? 'border-solid border-primary/40 bg-brand-soft/40' : 'hover:border-primary/50',
        invalid && 'border-destructive',
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', doc?.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
          {doc?.key ? <CheckCircle2 className="size-5" /> : <FileText className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {t.register.docTypes[type]}
            {REQUIRED_KYC_DOCUMENTS.includes(type) && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t.register.required}</span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {uploading
              ? fill(t.editor.uploading, { pct: Math.round((doc.progress ?? 0) * 100) })
              : doc
                ? (doc.name ?? t.register.uploaded)
                : REQUIRED_KYC_DOCUMENTS.includes(type) ? t.register.dropHint : `${t.register.dropHint} · ${t.common.optional}`}
          </p>
        </div>
      </div>
      {uploading && (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round((doc.progress ?? 0) * 100)}%` }} />
        </div>
      )}
      <div className="flex justify-end gap-1">
        {doc?.key && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onView(doc)}>
            {t.register.view}
          </Button>
        )}
        <Button type="button" variant={doc ? 'outline' : 'secondary'} size="sm" disabled={uploading} onClick={() => input.current?.click()}>
          {uploading ? <LoaderCircle className="animate-spin" /> : <Upload />}
          {doc ? t.register.replace : t.register.upload}
        </Button>
        {doc?.key && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t.register.remove} onClick={onRemove}>
            <X />
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={SHOP_RULES.kycMimeTypes.join(',')}
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
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
  htmlFor: string
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

function Banner({ tone = 'info', children }: { tone?: 'info' | 'danger'; children: React.ReactNode }) {
  const Icon = tone === 'danger' ? TriangleAlert : CircleAlert
  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-xl border p-3 text-sm',
        tone === 'danger'
          ? 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      {children}
    </p>
  )
}

function errorText(e: unknown, t: Dict): string {
  if (e instanceof ApiError && e.code && e.code in t.register.errors) return t.register.errors[e.code as ErrorKey]
  return t.common.saveError
}

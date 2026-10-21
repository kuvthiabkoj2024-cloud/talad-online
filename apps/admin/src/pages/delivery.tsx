import { PROVINCE_CODES, provinceName } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle } from '@talad/ui/components/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talad/ui/components/dialog'
import { Input } from '@talad/ui/components/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talad/ui/components/select'
import { Switch } from '@talad/ui/components/switch'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPinned, Pencil, Plus, Trash2, Truck, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { FlagBadge } from '@/components/badges'
import { ConfirmDialog, type ConfirmOptions } from '@/components/confirm-dialog'
import { Field } from '@/components/field'
import { PageBody, PageIntro, TopBar } from '@/components/page-header'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import type { Dict } from '@/i18n/en'
import { useI18n } from '@/i18n/context'
import { ApiError, api, send } from '@/lib/api'
import { fill, formatMoney, storefrontUrl } from '@/lib/format'
import type { Courier } from '@/lib/types'

const KEY = ['admin', 'delivery'] as const
type Zone = Courier['zones'][number]
const errorText = (e: unknown, t: Dict) =>
  e instanceof ApiError && e.code && e.code in t.delivery.errors ? t.delivery.errors[e.code as keyof Dict['delivery']['errors']] : t.common.saveError

/** Couriers and shipping zones (§2.7). */
export function DeliveryPage() {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: () => api<Courier[]>('/admin/delivery') })
  const [courier, setCourier] = useState<Partial<Courier> | null>(null)
  const [zone, setZone] = useState<{ courierId: string; zone: Partial<Zone> } | null>(null)
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null)
  const refresh = () => void queryClient.invalidateQueries({ queryKey: KEY })

  return (
    <>
      <TopBar title={t.delivery.title} />
      <PageBody>
        <PageIntro
          title={t.delivery.title}
          description={t.delivery.description}
          actions={
            <Button onClick={() => setCourier({ isActive: true, mode: 'manual' })}>
              <Plus />
              {t.delivery.addCourier}
            </Button>
          }
        />
        {list.isPending ? (
          <LoadingState />
        ) : list.isError ? (
          <ErrorState onRetry={() => void list.refetch()} />
        ) : list.data.length === 0 ? (
          <EmptyState icon={Truck} title={t.delivery.addCourier} />
        ) : (
          list.data.map((c) => (
            <Card key={c.id} className="gap-3">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {c.logoUrl ? <img src={storefrontUrl.asset(c.logoUrl)} alt="" className="size-6 rounded object-contain" /> : <Truck className="size-5 text-muted-foreground" />}
                  {c.name}
                  <span className="font-mono text-xs font-normal text-muted-foreground">{c.code}</span>
                  {!c.isActive && <FlagBadge tone="muted">{t.common.inactive}</FlagBadge>}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {t.delivery.modes[c.mode]} · {fill(t.delivery.ordersCount, { n: c.orderCount })}
                  </span>
                </CardTitle>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setZone({ courierId: c.id, zone: { provinces: [], baseFee: 0, perKgFee: 0 } })}>
                    <MapPinned />
                    {t.delivery.addZone}
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => setCourier(c)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.common.delete}
                    disabled={c.orderCount > 0}
                    onClick={() =>
                      setConfirm({
                        title: fill(t.delivery.deleteTitle, { name: c.name }),
                        description: t.catalog.deleteBody,
                        confirmLabel: t.common.delete,
                        destructive: true,
                        errorText: (e) => errorText(e, t),
                        onConfirm: async () => {
                          await send('DELETE', `/admin/delivery/${c.id}`)
                          refresh()
                        },
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {c.zones.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                    <TriangleAlert className="size-4" />
                    {t.delivery.noZones}
                  </p>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {c.zones.map((z) => (
                      <li key={z.id} className="flex items-center gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{z.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {z.provinces.length === 0 ? t.delivery.nationwide : z.provinces.map((p) => provinceName(p, locale)).join(', ')}
                          </span>
                        </span>
                        <span className="text-right text-xs text-muted-foreground tabular-nums">
                          {formatMoney(z.baseFee, locale)}
                          {z.perKgFee > 0 && ` + ${formatMoney(z.perKgFee, locale)}/kg`}
                        </span>
                        <Button variant="ghost" size="icon-sm" aria-label={t.common.edit} onClick={() => setZone({ courierId: c.id, zone: z })}>
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t.common.delete}
                          onClick={() =>
                            setConfirm({
                              title: fill(t.delivery.deleteTitle, { name: z.name }),
                              description: t.catalog.deleteBody,
                              confirmLabel: t.common.delete,
                              destructive: true,
                              onConfirm: async () => {
                                await send('DELETE', `/admin/delivery/${c.id}/zones/${z.id}`)
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
              </CardContent>
            </Card>
          ))
        )}
      </PageBody>

      <Dialog open={courier !== null} onOpenChange={(o) => !o && setCourier(null)}>
        <DialogContent className="sm:max-w-md">{courier && <CourierForm key={courier.id ?? 'new'} value={courier} onDone={() => (setCourier(null), refresh())} />}</DialogContent>
      </Dialog>
      <Dialog open={zone !== null} onOpenChange={(o) => !o && setZone(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
          {zone && <ZoneForm key={zone.zone.id ?? 'new'} courierId={zone.courierId} value={zone.zone} onDone={() => (setZone(null), refresh())} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog options={confirm} onClose={() => setConfirm(null)} />
    </>
  )
}

function CourierForm({ value, onDone }: { value: Partial<Courier>; onDone: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(value.name ?? '')
  const [code, setCode] = useState((value.code ?? '').toLowerCase())
  const [logoUrl, setLogoUrl] = useState(value.logoUrl ?? '')
  const [mode, setMode] = useState<Courier['mode']>(value.mode ?? 'manual')
  const [isActive, setIsActive] = useState(value.isActive ?? true)
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () => {
      const body = { name, code, logoUrl: logoUrl || null, mode, isActive }
      return value.id ? send('PUT', `/admin/delivery/${value.id}`, body) : send('POST', '/admin/delivery', body)
    },
    onSuccess: () => {
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
        <DialogTitle>{value.id ? t.delivery.editCourier : t.delivery.addCourier}</DialogTitle>
        <DialogDescription className="sr-only">{t.delivery.description}</DialogDescription>
      </DialogHeader>
      <Field required id="cname" label={t.delivery.name}>
        <Input id="cname" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field required id="ccode" label={t.delivery.code}>
        <Input id="ccode" required pattern="[a-z0-9-]{2,30}" className="font-mono" value={code} onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
      </Field>
      <Field id="clogo" label={t.delivery.logo}>
        <Input id="clogo" value={logoUrl} placeholder="https://…" onChange={(e) => setLogoUrl(e.target.value)} />
      </Field>
      <Field required id="cmode" label={t.delivery.mode}>
        <Select value={mode} onValueChange={(v) => setMode(v as Courier['mode'])}>
          <SelectTrigger id="cmode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">{t.delivery.modes.manual}</SelectItem>
            <SelectItem value="api">{t.delivery.modes.api}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={isActive} onCheckedChange={setIsActive} />
        {t.common.active}
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
          {t.common.save}
        </Button>
      </DialogFooter>
    </form>
  )
}

function ZoneForm({ courierId, value, onDone }: { courierId: string; value: Partial<Zone>; onDone: () => void }) {
  const { t, locale } = useI18n()
  const [name, setName] = useState(value.name ?? '')
  const [provinces, setProvinces] = useState<string[]>(value.provinces ?? [])
  const [baseFee, setBaseFee] = useState(String(value.baseFee ?? 0))
  const [perKg, setPerKg] = useState(String(value.perKgFee ?? 0))
  const save = useMutation({
    mutationFn: () => {
      const body = { name, provinces, baseFee: Number(baseFee) || 0, perKgFee: Number(perKg) || 0 }
      return value.id ? send('PUT', `/admin/delivery/${courierId}/zones/${value.id}`, body) : send('POST', `/admin/delivery/${courierId}/zones`, body)
    },
    onSuccess: () => {
      toast.success(t.common.saved)
      onDone()
    },
    onError: () => toast.error(t.common.saveError),
  })
  const toggle = (code: string) => setProvinces((p) => (p.includes(code) ? p.filter((x) => x !== code) : [...p, code]))
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate()
      }}
    >
      <DialogHeader>
        <DialogTitle>{value.id ? t.delivery.editZone : t.delivery.addZone}</DialogTitle>
        <DialogDescription>{t.delivery.nationwideHint}</DialogDescription>
      </DialogHeader>
      <Field required id="zname" label={t.delivery.zoneName}>
        <Input id="zname" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">
          {t.delivery.provinces} {provinces.length === 0 && <span className="font-normal text-muted-foreground">· {t.delivery.nationwide}</span>}
        </legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {PROVINCE_CODES.map((code) => (
            <label key={code} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-(--primary)" checked={provinces.includes(code)} onChange={() => toggle(code)} />
              {provinceName(code, locale)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-4">
        <Field required id="base" label={t.delivery.baseFee}>
          <Input id="base" inputMode="numeric" value={baseFee} onChange={(e) => setBaseFee(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
        <Field required id="kg" label={t.delivery.perKg}>
          <Input id="kg" inputMode="numeric" value={perKg} onChange={(e) => setPerKg(e.target.value.replace(/[^\d.]/g, ''))} />
        </Field>
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

import { POINT_TIER_RULES, pointTierRanges, pointTiersValid } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Input } from '@talad/ui/components/input'
import { MoneyInput } from '@talad/ui/components/money-input'
import { Plus, Trash2 } from 'lucide-react'
import { useId } from 'react'
import { useI18n } from '@/i18n/context'
import { fill, formatMoney } from '@/lib/format'
import { tiersOf, type TierRow } from '@/lib/point-tiers'

/** The points an order earns by its total: ranges the admin adds, edits and deletes. */
export function PointTiersField({
  rows,
  onChange,
  pointValue,
  legacyEarnPer,
}: {
  rows: TierRow[]
  onChange: (rows: TierRow[]) => void
  pointValue: number
  legacyEarnPer: number | null
}) {
  const { t, locale } = useI18n()
  const c = t.settings.pointTiers
  const base = useId()
  const tiers = tiersOf(rows)
  const valid = pointTiersValid(tiers)
  const update = (id: string, patch: Partial<TierRow>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-medium">{c.title}</p>
        <p className="text-xs text-muted-foreground">{c.hint}</p>
      </div>
      {legacyEarnPer !== null && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {fill(c.legacy, { amount: formatMoney(legacyEarnPer, locale) })}
        </p>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[minmax(0,1fr)_6rem_2.25rem] gap-2 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,20rem)_8rem_2.25rem]">
            <span id={`${base}-upto`}>{c.upTo}</span>
            <span id={`${base}-points`}>{c.points}</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_6rem_2.25rem] gap-2 sm:grid-cols-[minmax(0,20rem)_8rem_2.25rem]">
              <MoneyInput aria-labelledby={`${base}-upto`} placeholder={c.noLimit} value={r.upTo} onValueChange={(v) => update(r.id, { upTo: v })} />
              <Input aria-labelledby={`${base}-points`} inputMode="numeric" value={r.points} onChange={(e) => update(r.id, { points: e.target.value.replace(/\D/g, '') })} />
              <Button type="button" variant="ghost" size="icon" aria-label={t.common.delete} className="text-destructive hover:text-destructive" onClick={() => onChange(rows.filter((x) => x.id !== r.id))}>
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={rows.length >= POINT_TIER_RULES.maxTiers}
        onClick={() => onChange([...rows, { id: crypto.randomUUID(), upTo: '', points: '' }])}
      >
        <Plus />
        {c.add}
      </Button>
      {rows.length > 0 &&
        (valid ? (
          <ul className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-sm">
            {pointTierRanges(tiers).map((r) => (
              <li key={r.upTo ?? 'open'}>
                {fill(r.upTo === null ? (r.over ? c.previewAbove : c.previewAny) : r.over ? c.previewRange : c.previewUpTo, {
                  min: formatMoney(r.over, locale),
                  max: r.upTo === null ? '' : formatMoney(r.upTo, locale),
                  n: r.points.toLocaleString('en-US'),
                  value: formatMoney(r.points * pointValue, locale),
                })}
              </li>
            ))}
          </ul>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {t.settings.POINT_TIERS_INVALID}
          </p>
        ))}
      {rows.length === 0 && legacyEarnPer === null && <p className="text-sm text-muted-foreground">{c.off}</p>}
    </div>
  )
}

import { PRODUCT_RULES } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import { Input } from '@talad/ui/components/input'
import { MoneyInput } from '@talad/ui/components/money-input'
import { Label } from '@talad/ui/components/label'
import { cn } from '@talad/ui/lib/utils'
import { Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { Dict } from '@/i18n/en'
import { fill, formatNumber } from '@/lib/format'
import { useI18n } from '@/i18n/context'
import { autoSku, blankCell, combinations, comboKey, type OptionGroup, type VariantCell } from '@/lib/product-options'

const presetsFor = (name: string, t: Dict) => {
  const n = name.trim().toLowerCase()
  if (/colou?r|ສີ/.test(n)) return t.editor.colourPresets.split(',').map((s) => s.trim())
  if (/size|ຂະໜາດ|ໄຊ/.test(n)) return t.editor.sizePresets.split(',').map((s) => s.trim())
  return []
}

/**
 * Up to two options (colour and size by default) as value chips, then a table with the
 * price and stock of every combination — grouped by the first option when there are two.
 */
export function ProductOptionsEditor({
  options,
  onOptions,
  cells,
  onCells,
  baseSku,
  basePrice,
  errors,
}: {
  options: OptionGroup[]
  onOptions: (next: OptionGroup[]) => void
  cells: Record<string, VariantCell>
  onCells: (next: Record<string, VariantCell>) => void
  baseSku: string
  basePrice: string
  errors: Partial<Record<string, string>>
}) {
  const { t, locale } = useI18n()
  const [showSkus, setShowSkus] = useState(false)
  const [bulkStock, setBulkStock] = useState('')
  const [bulkPrice, setBulkPrice] = useState('')
  const rows = combinations(options)
  const cell = (values: string[]) => cells[comboKey(values)] ?? blankCell()
  const setCell = (values: string[], patch: Partial<VariantCell>) => onCells({ ...cells, [comboKey(values)]: { ...cell(values), ...patch } })
  const total = rows.reduce((n, r) => n + (Number(cell(r).stock) || 0), 0)
  const named = options.filter((o) => o.values.length)
  const grouped = named.length === 2

  function applyBulk() {
    const next = { ...cells }
    for (const r of rows) {
      const c = cell(r)
      next[comboKey(r)] = { ...c, ...(bulkStock.trim() !== '' && { stock: bulkStock.trim() }), ...(bulkPrice.trim() !== '' && { price: bulkPrice.trim() }) }
    }
    onCells(next)
    setBulkStock('')
    setBulkPrice('')
  }

  const row = (values: string[], label: string) => {
    const k = comboKey(values)
    const c = cell(values)
    const sku = c.autoSku ? autoSku(baseSku, values) : c.sku
    return (
      <div key={k} className={cn('grid grid-cols-2 items-center gap-2 px-3 py-2 sm:gap-3', showSkus ? 'sm:grid-cols-[minmax(0,1fr)_9rem_7rem_minmax(0,12rem)]' : 'sm:grid-cols-[minmax(0,1fr)_9rem_7rem]')}>
        <span className="col-span-2 truncate text-sm font-medium sm:col-span-1">{label}</span>
        <MoneyInput
          aria-label={`${t.editor.optionPrice} · ${label}`}
          placeholder={basePrice ? Number(basePrice).toLocaleString('en-US') : t.editor.optionPriceHint}
          value={c.price}
          onValueChange={(v) => setCell(values, { price: v })}
          aria-invalid={errors[`price-${k}`] ? true : undefined}
          className="h-9"
        />
        <Input
          aria-label={`${t.editor.stock} · ${label}`}
          inputMode="numeric"
          value={c.stock}
          onChange={(e) => setCell(values, { stock: e.target.value })}
          aria-invalid={errors[`stock-${k}`] ? true : undefined}
          className="h-9 tabular-nums"
        />
        {showSkus && (
          <Input
            aria-label={`${t.editor.sku} · ${label}`}
            value={sku}
            onChange={(e) => setCell(values, { sku: e.target.value, autoSku: false })}
            aria-invalid={errors[`sku-${k}`] ? true : undefined}
            className="col-span-2 h-9 font-mono text-xs sm:col-span-1"
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 lg:grid-cols-2">
        {options.map((o, i) => (
          <OptionCard
            key={o.uid}
            option={o}
            index={i}
            canRemove={options.length > 1}
            onChange={(next) => onOptions(options.map((x) => (x.uid === o.uid ? next : x)))}
            onRemove={() => onOptions(options.filter((x) => x.uid !== o.uid))}
          />
        ))}
        {options.length < PRODUCT_RULES.maxOptions && (
          <button
            type="button"
            onClick={() => onOptions([...options, { uid: crypto.randomUUID(), name: '', values: [] }])}
            className="flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            <Plus className="size-5" />
            {t.editor.addOptionGroup}
          </button>
        )}
      </div>
      {errors.options && <p className="text-sm text-destructive">{errors.options}</p>}

      <div className="rounded-xl border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold">{t.editor.stockTable}</p>
            {rows.length > 0 && (
              <p className="text-xs text-muted-foreground">{fill(t.editor.stockTableHint, { n: rows.length, stock: formatNumber(total, locale) })}</p>
            )}
          </div>
          {rows.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <MoneyInput value={bulkPrice} onValueChange={setBulkPrice} placeholder={t.editor.setAllPrice} aria-label={t.editor.setAllPrice} className="h-8 w-32" />
              <Input inputMode="numeric" value={bulkStock} onChange={(e) => setBulkStock(e.target.value)} placeholder={t.editor.setAllStock} aria-label={t.editor.setAllStock} className="h-8 w-32" />
              <Button type="button" size="sm" variant="outline" disabled={!bulkStock.trim() && !bulkPrice.trim()} onClick={applyBulk}>
                {t.editor.apply}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowSkus((s) => !s)}>
                {showSkus ? t.editor.hideSkus : t.editor.showSkus}
              </Button>
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">{t.editor.noCombos}</p>
        ) : (
          <>
            <div
              className={cn(
                'hidden gap-3 px-3 pt-2 text-xs font-medium text-muted-foreground sm:grid',
                showSkus ? 'sm:grid-cols-[minmax(0,1fr)_9rem_7rem_minmax(0,12rem)]' : 'sm:grid-cols-[minmax(0,1fr)_9rem_7rem]',
              )}
            >
              <span>{named.map((o) => o.name || '—').join(' · ')}</span>
              <span>
                {t.editor.optionPrice} <span className="font-normal">({t.editor.optionPriceHint})</span>
              </span>
              <span>{t.editor.stock}</span>
              {showSkus && <span>{t.editor.sku}</span>}
            </div>
            {grouped ? (
              // Grouped by the first option: "Red" with its sizes and their total stock.
              named[0].values.map((first) => {
                const group = rows.filter((r) => r[0] === first)
                const subtotal = group.reduce((n, r) => n + (Number(cell(r).stock) || 0), 0)
                return (
                  <div key={first} className="border-t first:border-t-0">
                    <p className="flex items-center justify-between bg-muted/20 px-3 pt-2.5 pb-1 text-sm font-semibold">
                      {first}
                      <span className="text-xs font-normal text-muted-foreground tabular-nums">
                        {t.editor.stock}: {formatNumber(subtotal, locale)}
                      </span>
                    </p>
                    <div className="divide-y divide-dashed">{group.map((r) => row(r, r[1]))}</div>
                  </div>
                )
              })
            ) : (
              <div className="divide-y">{rows.map((r) => row(r, r.join(' · ')))}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** One option: its name (with quick picks) and values as chips (type + Enter, or quick add). */
function OptionCard({ option, index, canRemove, onChange, onRemove }: { option: OptionGroup; index: number; canRemove: boolean; onChange: (o: OptionGroup) => void; onRemove: () => void }) {
  const { t } = useI18n()
  const [draft, setDraft] = useState('')
  const names = [t.editor.colour, t.editor.size, ...t.editor.optionPresets.split(',').map((s) => s.trim())]
  const presets = presetsFor(option.name, t).filter((p) => !option.values.some((v) => v.toLowerCase() === p.toLowerCase()))
  const nameId = `option-name-${option.uid}`

  function add(raw: string) {
    const values = raw
      .split(/[,，\n]/)
      .map((v) => v.trim().slice(0, 50))
      .filter(Boolean)
    const next = [...option.values]
    for (const v of values) if (!next.some((x) => x.toLowerCase() === v.toLowerCase()) && next.length < PRODUCT_RULES.maxOptionValues) next.push(v)
    onChange({ ...option, values: next })
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={nameId} required>
            {t.editor.optionName} {index + 1}
          </Label>
          <Input id={nameId} value={option.name} maxLength={30} placeholder={t.editor.optionNamePlaceholder} onChange={(e) => onChange({ ...option, name: e.target.value })} />
        </div>
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" aria-label={t.editor.removeOptionGroup} title={t.editor.removeOptionGroup} className="mt-6 text-muted-foreground hover:text-destructive" onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
      </div>
      {!option.name.trim() && (
        <div className="-mt-1 flex flex-wrap gap-1.5">
          {names.map((n) => (
            <button key={n} type="button" onClick={() => onChange({ ...option, name: n })} className="rounded-full border px-2.5 py-1 text-xs hover:border-primary hover:text-primary">
              {n}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label required>{t.editor.valuesLabel}</Label>
        {option.values.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {option.values.map((v) => (
              <li key={v} className="flex items-center gap-1 rounded-full bg-brand-soft py-1 pr-1 pl-3 text-sm font-medium text-primary">
                {v}
                <button
                  type="button"
                  aria-label={`${t.editor.remove} ${v}`}
                  onClick={() => onChange({ ...option, values: option.values.filter((x) => x !== v) })}
                  className="flex size-5 items-center justify-center rounded-full hover:bg-primary/15"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            value={draft}
            placeholder={t.editor.valuePlaceholder}
            aria-label={`${option.name || t.editor.optionName}: ${t.editor.valuesLabel}`}
            onChange={(e) => (/[,，]/.test(e.target.value) ? add(e.target.value) : setDraft(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                add(draft)
              } else if (e.key === 'Backspace' && !draft && option.values.length) {
                onChange({ ...option, values: option.values.slice(0, -1) })
              }
            }}
          />
          <Button type="button" variant="outline" disabled={!draft.trim()} onClick={() => add(draft)}>
            <Plus />
            {t.editor.addValue}
          </Button>
        </div>
        {presets.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-xs text-muted-foreground">{t.editor.quickAdd}:</span>
            {presets.map((p) => (
              <button key={p} type="button" onClick={() => add(p)} className="rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                + {p}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

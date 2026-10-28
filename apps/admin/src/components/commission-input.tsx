import { Input } from '@talad/ui/components/input'
import { cn } from '@talad/ui/lib/utils'
import { useI18n } from '@/i18n/context'
import type { CommissionDraft } from '@/lib/commission'

/** A percent of each sale, or a fixed kip amount per unit sold (for high-cost goods). */
export function CommissionInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string
  value: CommissionDraft
  onChange: (d: CommissionDraft) => void
  placeholder?: string
}) {
  const { t } = useI18n()
  return (
    <div className="flex gap-2">
      <div role="radiogroup" aria-label={t.commission.type} className="flex shrink-0 rounded-md border p-0.5">
        {(['PERCENT', 'FIXED'] as const).map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={value.type === type}
            onClick={() => onChange({ type, value: type === value.type ? value.value : '' })}
            className={cn(
              'rounded px-2.5 text-sm font-medium transition-colors',
              value.type === type ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {type === 'PERCENT' ? '%' : '₭'}
          </button>
        ))}
      </div>
      <Input
        id={id}
        inputMode={value.type === 'PERCENT' ? 'decimal' : 'numeric'}
        value={value.type === 'FIXED' && value.value ? Number(value.value).toLocaleString('en-US') : value.value}
        placeholder={placeholder}
        onChange={(e) =>
          onChange({ ...value, value: value.type === 'PERCENT' ? e.target.value.replace(/[^\d.]/g, '') : e.target.value.replace(/\D/g, '') })
        }
      />
      {value.type === 'FIXED' && <span className="self-center whitespace-nowrap text-sm text-muted-foreground">{t.commission.perUnit}</span>}
    </div>
  )
}

import { Button } from '@talad/ui/components/button'
import { Input } from '@talad/ui/components/input'
import { cn } from '@talad/ui/lib/utils'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useI18n } from '@/i18n/context'
import { fill } from '@/lib/format'

export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
}) {
  const { t } = useI18n()
  return (
    <div className={cn('relative md:w-72', className)}>
      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={t.common.search}
        className="bg-card pl-9"
      />
    </div>
  )
}

/** Horizontal pill tabs with counts; scrolls sideways on phones. */
export function FilterTabs<K extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: { key: K; label: string; count?: number }[]
  active: K
  onSelect: (key: K) => void
}) {
  return (
    <nav className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
      {tabs.map((tab) => {
        const on = tab.key === active
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            aria-pressed={on}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              on ? 'border-primary bg-brand-soft font-medium text-primary' : 'bg-card text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && <span className="text-xs tabular-nums opacity-70">{tab.count}</span>}
          </button>
        )
      })}
    </nav>
  )
}

export function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  const { t } = useI18n()
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>{fill(t.common.pageOf, { page, total: totalPages })}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
          {t.common.prev}
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          {t.common.next}
          <ChevronRight />
        </Button>
      </div>
    </div>
  )
}

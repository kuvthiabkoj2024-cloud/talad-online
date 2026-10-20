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

/** Pages to show as buttons: the first, the last, and the ones around `page` (… between gaps). */
function pageList(page: number, total: number): (number | '…')[] {
  const keep = new Set([1, total, page - 1, page, page + 1].filter((p) => p >= 1 && p <= total))
  const out: (number | '…')[] = []
  for (const p of [...keep].sort((a, b) => a - b)) {
    const last = out.at(-1)
    if (typeof last === 'number' && p - last > 1) out.push('…')
    out.push(p)
  }
  return out
}

/**
 * Previous / numbered pages / next. With `total` and `pageSize` it also says which items are
 * shown ("1–20 of 57"), and with `onPageSize` lets the seller choose how many per page — then
 * it stays visible even when everything fits on one page.
 */
export function Pager({
  page,
  totalPages,
  onPage,
  total,
  pageSize,
  pageSizes = [10, 20, 50],
  onPageSize,
}: {
  page: number
  totalPages: number
  onPage: (page: number) => void
  total?: number
  pageSize?: number
  pageSizes?: number[]
  onPageSize?: (size: number) => void
}) {
  const { t } = useI18n()
  const detailed = total !== undefined && pageSize !== undefined
  if (totalPages <= 1 && !(detailed && onPageSize && total > 0)) return null
  const from = detailed ? (page - 1) * pageSize + 1 : 0
  const to = detailed ? Math.min(total, page * pageSize) : 0
  return (
    <nav aria-label={fill(t.common.pageOf, { page, total: totalPages })} className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <div className="flex flex-wrap items-center gap-3">
        <span>{detailed ? fill(t.common.showing, { from, to, total }) : fill(t.common.pageOf, { page, total: totalPages })}</span>
        {onPageSize && pageSize !== undefined && (
          <label className="flex items-center gap-1.5">
            <span>{t.common.perPage}</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="h-8 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {pageSizes.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t.common.prev}>
            <ChevronLeft />
            <span className="max-sm:hidden">{t.common.prev}</span>
          </Button>
          {pageList(page, totalPages).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'ghost'}
                size="sm"
                className="min-w-8 tabular-nums"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => p !== page && onPage(p)}
              >
                {p}
              </Button>
            ),
          )}
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label={t.common.next}>
            <span className="max-sm:hidden">{t.common.next}</span>
            <ChevronRight />
          </Button>
        </div>
      )}
    </nav>
  )
}

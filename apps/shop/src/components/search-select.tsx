import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@talad/ui/components/command'
import { Popover, PopoverContent, PopoverTrigger } from '@talad/ui/components/popover'
import { cn } from '@talad/ui/lib/utils'
import { ChevronsUpDown } from 'lucide-react'
import { useState } from 'react'

export interface SearchSelectItem {
  value: string
  label: string
  /** Extra words that find it (e.g. the name in the other language, a code). */
  keywords?: string[]
  /** A sub-item (shown indented under its group's parent). */
  indent?: boolean
  /** Shown faintly after the label (e.g. a unit code). */
  hint?: string
}

/**
 * A select you can search: tap to open, type to filter (any language), pick one.
 * For long lists like categories and units.
 */
export function SearchSelect({
  value,
  onChange,
  groups,
  placeholder,
  searchPlaceholder,
  empty,
  invalid,
  id,
}: {
  value: string
  onChange: (value: string) => void
  groups: { label?: string; items: SearchSelectItem[] }[]
  placeholder: string
  searchPlaceholder: string
  empty: string
  invalid?: boolean
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = groups.flatMap((g) => g.items).find((i) => i.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30',
            !selected && 'text-muted-foreground',
          )}
        >
          <span className="min-w-0 truncate">
            {selected ? (
              <>
                {selected.label}
                {selected.hint && <span className="ml-1.5 text-muted-foreground">{selected.hint}</span>}
              </>
            ) : (
              placeholder
            )}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{empty}</CommandEmpty>
            {groups.map((g, gi) => (
              <CommandGroup key={g.label ?? gi} heading={g.label}>
                {g.items.map((item) => (
                  <CommandItem
                    key={item.value}
                    value={item.value}
                    keywords={[item.label, ...(item.keywords ?? []), ...(g.label ? [g.label] : [])]}
                    data-checked={item.value === value}
                    onSelect={() => {
                      onChange(item.value)
                      setOpen(false)
                    }}
                    className={cn(item.indent && 'pl-6')}
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                    {item.hint && <span className="text-xs text-muted-foreground">{item.hint}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

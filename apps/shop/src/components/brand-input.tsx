import { BRAND_RULES } from '@talad/shared'
import { Input } from '@talad/ui/components/input'
import { useQuery } from '@tanstack/react-query'
import { useDeferredValue } from 'react'
import { api } from '@/lib/api'

/** A brand name box that suggests brands already on MC Mart (one spelling per brand). */
export function BrandInput({ id, value, placeholder, onChange, autoFocus }: { id: string; value: string; placeholder: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const term = useDeferredValue(value.trim())
  const suggestions = useQuery({
    queryKey: ['brands', 'suggest', term],
    queryFn: () => api<{ slug: string; name: string }[]>(`/brands?${new URLSearchParams({ limit: '12', ...(term && { q: term }) })}`),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  })
  const listId = `${id}-options`
  return (
    <>
      <Input id={id} list={listId} value={value} maxLength={BRAND_RULES.nameMax} placeholder={placeholder} autoComplete="off" autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
      <datalist id={listId}>
        {suggestions.data?.map((b) => (
          <option key={b.slug} value={b.name} />
        ))}
      </datalist>
    </>
  )
}

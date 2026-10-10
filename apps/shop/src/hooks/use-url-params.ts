import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

/** List filters kept in the URL (shareable, survive reloads). `set` removes empty values. */
export function useUrlParams() {
  const [params, setParams] = useSearchParams()
  const set = useCallback(
    (next: Record<string, string | undefined>) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(next)) {
            if (v) p.set(k, v)
            else p.delete(k)
          }
          return p
        },
        { replace: true },
      ),
    [setParams],
  )
  return { params, set, page: Math.max(1, Number(params.get('page')) || 1) }
}

/** Search box text that updates the `q` URL param after a short pause. */
export function useSearchParamInput(q: string, set: (next: Record<string, string | undefined>) => void) {
  const [value, setValue] = useState(q)
  useEffect(() => {
    if (value.trim() === q) return
    const id = setTimeout(() => set({ q: value.trim() || undefined, page: undefined }), 300)
    return () => clearTimeout(id)
  }, [value, q, set])
  return [value, setValue] as const
}

import * as React from "react"

import { Input } from "@talad/ui/components/input"

/** Whole kip only (LAK has no subunit in practice): "2000000" → "2,000,000". */
const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

/** The digits a stored value stands for; "25000.00" from the API is 25000, not 2500000. */
function toDigits(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return ""
  const n = Number(String(value).replace(/,/g, ""))
  return Number.isFinite(n) ? String(Math.max(0, Math.round(n))) : ""
}

/**
 * An amount field that shows thousands separators while typing ("2,000,000") but reports
 * plain digits ("2000000") through `onValueChange`. The cursor stays after the same digit.
 */
function MoneyInput({
  value,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type" | "inputMode"> & {
  value: string | number | null | undefined
  onValueChange: (digits: string) => void
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  const caret = React.useRef<number | null>(null)
  const shown = group(toDigits(value))

  // After a re-render, put the cursor back after the same number of digits.
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || caret.current === null || document.activeElement !== el) return
    let pos = 0
    for (let seen = 0; pos < shown.length && seen < caret.current; pos++) if (/\d/.test(shown[pos])) seen++
    el.setSelectionRange(pos, pos)
    caret.current = null
  }, [shown])

  return (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={shown}
      onChange={(e) => {
        const raw = e.target.value
        const before = raw.slice(0, e.target.selectionStart ?? raw.length)
        caret.current = before.replace(/\D/g, "").length
        // Leading zeros dropped ("007" → "7"), empty stays empty.
        onValueChange(raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 15))
      }}
    />
  )
}

export { MoneyInput }

import { useEffect, useRef, useState } from 'react'

export interface Column {
  /** X label (e.g. a date). */
  key: string
  value: number
}

const HEIGHT = 200
const PAD = { top: 12, right: 8, bottom: 24, left: 48 }
const MAX_BAR = 24
const GAP = 2
/** Date labels closer than this to the last one are skipped (narrow screens). */
const MIN_LABEL_GAP = 56

/** 0 / 1,000 / 2,000…: about four clean steps covering `max` (whole steps for counts). */
function niceTicks(max: number, integer: boolean): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(integer ? 1 : 0, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && (!integer || Number.isInteger(s)))!)
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

/** A column whose data end (top) has 4px rounded corners and whose base is square. */
function columnPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h)
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`
}

/**
 * Single-series column chart (one measure over time). Hover, focus or ←/→ shows a tooltip
 * for each column; `format` renders values, `detail` adds lines to the tooltip.
 */
export function ColumnChart({
  data,
  label,
  format,
  formatTick,
  formatKey,
  detail,
  integer = false,
}: {
  data: Column[]
  /** Accessible description of the whole chart. */
  label: string
  format: (v: number) => string
  formatTick: (v: number) => string
  formatKey: (key: string) => string
  detail?: (i: number) => string | null
  /** Counts: whole-number ticks only. */
  integer?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ticks = niceTicks(Math.max(0, ...data.map((d) => d.value)), integer)
  const top = ticks[ticks.length - 1]
  const plotW = width - PAD.left - PAD.right
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const band = plotW / Math.max(1, data.length)
  const barW = Math.max(1, Math.min(MAX_BAR, band - GAP))
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  // A few evenly spaced date labels: first, last and up to three between.
  const labelEvery = Math.max(1, Math.ceil(data.length / 5))
  const current = active !== null ? data[active] : null

  return (
    <div
      ref={box}
      className="relative outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={0}
      role="group"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1))
        else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? data.length) - 1))
        else return
        e.preventDefault()
      }}
      onBlur={() => setActive(null)}
      onPointerLeave={() => setActive(null)}
      style={{ minHeight: HEIGHT }}
    >
      {/* Drawn once the container is measured, so it never overflows a narrow screen. */}
      {width > 0 && (
      <svg width={width} height={HEIGHT} className="block overflow-visible" aria-hidden>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + i * band + (band - barW) / 2
          const h = Math.max(0, PAD.top + plotH - y(d.value))
          return (
            <g key={d.key}>
              {h > 0 && (
                <path
                  d={columnPath(x, y(d.value), barW, h)}
                  className="fill-chart-series transition-opacity"
                  opacity={active === null || active === i ? 1 : 0.45}
                />
              )}
              {/* Hit target: the whole column band, taller than the mark. */}
              <rect x={PAD.left + i * band} y={PAD.top} width={band} height={plotH} fill="transparent" onPointerEnter={() => setActive(i)} />
              {((i % labelEvery === 0 && (data.length - 1 - i) * band >= MIN_LABEL_GAP) || i === data.length - 1) && (
                <text x={PAD.left + i * band + band / 2} y={HEIGHT - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                  {formatKey(d.key)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      )}

      {current && active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-32 -translate-x-1/2 rounded-lg border bg-popover px-3 py-2 text-sm shadow-md"
          style={{
            left: Math.min(width - 70, Math.max(70, PAD.left + active * band + band / 2)),
            top: Math.max(0, y(current.value) - 64),
          }}
        >
          <p className="font-semibold tabular-nums">{format(current.value)}</p>
          {detail?.(active) && <p className="text-xs text-muted-foreground tabular-nums">{detail(active)}</p>}
          <p className="text-xs text-muted-foreground">{formatKey(current.key)}</p>
        </div>
      )}
    </div>
  )
}

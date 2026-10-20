import { useEffect, useId, useRef, useState } from 'react'

export interface SalesPoint {
  /** X label (a date, `YYYY-MM-DD`). */
  key: string
  value: number
  /** The same day of the previous period (and its date), for the comparison line. */
  previous: number | null
  previousKey: string | null
}

const HEIGHT = 260
const PAD = { top: 16, right: 16, bottom: 28, left: 52 }
/** Date labels closer than this to the last one are skipped. */
const MIN_LABEL_GAP = 56

/** 0 / 1,000 / 2,000…: about four clean steps covering `max` (whole steps for counts). */
function niceTicks(max: number, integer: boolean): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = Math.max(integer ? 1 : 0, [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && (!integer || Number.isInteger(s)))!)
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

/**
 * Sales over time: this period as a line with a soft fill, the previous period as a dashed
 * line on the same axis. Hover, touch, focus + ←/→ move a crosshair with both values.
 */
export function SalesChart({
  data,
  label,
  format,
  formatTick,
  formatKey,
  currentLabel,
  previousLabel,
  integer = false,
}: {
  data: SalesPoint[]
  /** Accessible description of the whole chart. */
  label: string
  format: (v: number) => string
  formatTick: (v: number) => string
  formatKey: (key: string) => string
  currentLabel: string
  previousLabel: string
  integer?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const gradient = useId()

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const hasPrevious = data.some((d) => d.previous !== null)
  const ticks = niceTicks(Math.max(0, ...data.map((d) => Math.max(d.value, d.previous ?? 0))), integer)
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(1, width - PAD.left - PAD.right)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number) => PAD.left + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2)
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH
  const line = (pick: (d: SalesPoint) => number) => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(pick(d)).toFixed(1)}`).join('')
  const current = line((d) => d.value)
  const area = `${current}L${x(data.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
  const labelEvery = Math.max(1, Math.ceil(data.length / 5))
  const point = active !== null ? data[active] : null

  /** The data point under the pointer (nearest day). */
  function pick(clientX: number) {
    const rect = box.current?.getBoundingClientRect()
    if (!rect || data.length === 0) return
    const ratio = (clientX - rect.left - PAD.left) / plotW
    setActive(Math.max(0, Math.min(data.length - 1, Math.round(ratio * (data.length - 1)))))
  }

  return (
    <div
      ref={box}
      className="relative touch-pan-y outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
      tabIndex={0}
      role="group"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1))
        else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? data.length) - 1))
        else return
        e.preventDefault()
      }}
      onPointerMove={(e) => pick(e.clientX)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerLeave={() => setActive(null)}
      onBlur={() => setActive(null)}
      style={{ minHeight: HEIGHT }}
    >
      {/* Drawn once the container is measured, so it never overflows a narrow screen. */}
      {width > 0 && (
        <svg width={width} height={HEIGHT} className="block overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--chart-series)' }} stopOpacity={0.22} />
              <stop offset="100%" style={{ stopColor: 'var(--chart-series)' }} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Recessive grid and axis labels. */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2 4'} />
              <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {formatTick(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) =>
            // Evenly spaced, plus the last day; one too close to the last is dropped (narrow screens).
            (i % labelEvery === 0 && x(data.length - 1) - x(i) >= MIN_LABEL_GAP) || i === data.length - 1 ? (
              <text
                key={d.key}
                x={x(i)}
                y={HEIGHT - 8}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                className="fill-muted-foreground text-[11px]"
              >
                {formatKey(d.key)}
              </text>
            ) : null,
          )}

          {/* Previous period: dashed, neutral (context, not the story). */}
          {hasPrevious && (
            <path d={line((d) => d.previous ?? 0)} fill="none" className="stroke-muted-foreground/60" strokeWidth={2} strokeDasharray="5 5" strokeLinejoin="round" strokeLinecap="round" />
          )}
          <path d={area} fill={`url(#${gradient})`} />
          <path d={current} fill="none" className="stroke-chart-series" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {/* Crosshair with a marker on each line (2px surface ring keeps them readable). */}
          {point && active !== null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} className="stroke-foreground/25" strokeWidth={1} />
              {hasPrevious && point.previous !== null && <circle cx={x(active)} cy={y(point.previous)} r={4} className="fill-muted-foreground stroke-card" strokeWidth={2} />}
              <circle cx={x(active)} cy={y(point.value)} r={5} className="fill-chart-series stroke-card" strokeWidth={2} />
            </g>
          )}
          {/* The period's end, always marked. */}
          {!point && data.length > 0 && <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].value)} r={4.5} className="fill-chart-series stroke-card" strokeWidth={2} />}
        </svg>
      )}

      {point && active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 rounded-xl border bg-popover px-3 py-2.5 text-sm shadow-lg"
          style={{ left: Math.min(width - 84, Math.max(84, x(active))), top: Math.max(0, Math.min(y(point.value), HEIGHT - 140) - 8) }}
        >
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{formatKey(point.key)}</p>
          <p className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-0.5 w-3 rounded-full bg-chart-series" />
              {currentLabel}
            </span>
            <span className="font-semibold tabular-nums">{format(point.value)}</span>
          </p>
          {hasPrevious && point.previous !== null && (
            <p className="mt-1 flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="w-3 border-t-2 border-dashed border-muted-foreground/70" />
                {previousLabel}
              </span>
              <span className="tabular-nums text-muted-foreground">{format(point.previous)}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

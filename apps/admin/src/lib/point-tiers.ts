import type { PointTier } from '@talad/shared'

export interface TierRow {
  id: string
  upTo: string
  points: string
}

export const rowsOf = (tiers: PointTier[]): TierRow[] =>
  tiers.map((t) => ({ id: crypto.randomUUID(), upTo: t.upTo === null ? '' : String(t.upTo), points: String(t.points) }))

export const tiersOf = (rows: TierRow[]): PointTier[] => rows.map((r) => ({ upTo: r.upTo === '' ? null : Number(r.upTo), points: Number(r.points) || 0 }))

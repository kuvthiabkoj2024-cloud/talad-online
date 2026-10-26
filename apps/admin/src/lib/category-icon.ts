/** Lucide's icons as plain SVG files (pinned, so an icon never changes under a category). */
export const LUCIDE_ICONS = 'https://cdn.jsdelivr.net/npm/lucide-static@1.61.0/icons/'

/** Lucide SVGs draw in black, so they need inverting on dark backgrounds. */
export const isLucideIcon = (url: string | null | undefined) => Boolean(url?.startsWith(LUCIDE_ICONS))

/** What the icon field shows for a saved icon: the Lucide name for Lucide icons, else the link. */
export function iconFieldValue(iconUrl: string | null | undefined): string {
  if (!iconUrl) return ''
  return iconUrl.startsWith(LUCIDE_ICONS) && iconUrl.endsWith('.svg') ? iconUrl.slice(LUCIDE_ICONS.length, -4) : iconUrl
}

/**
 * The icon URL to save for what was typed: a link is kept as it is, anything else is a Lucide
 * icon name ("utensils-crossed", "Utensils Crossed" or "utensils-crossed.svg").
 */
export function iconUrlFrom(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  const name = value
    .toLowerCase()
    .replace(/\.svg$/, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
  return name ? `${LUCIDE_ICONS}${name}.svg` : null
}

import { MapPin } from 'lucide-react'

/** Google Maps for directions (opens the app on phones). */
const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

/** A small OpenStreetMap view around the point (no API key needed). */
const embedUrl = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.003},${lat - 0.0018},${lng + 0.003},${lat + 0.0018}&layer=mapnik&marker=${lat},${lng}`

/** A location shared in the chat (e.g. where the customer wants delivery): opens Google Maps. */
export function LocationCard({ lat, lng, label, open }: { lat: number; lng: number; label: string; open: string }) {
  return (
    <a
      href={mapsUrl(lat, lng)}
      target="_blank"
      rel="noreferrer"
      className="block w-72 max-w-full overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
    >
      <span className="relative block h-40 bg-muted">
        <iframe title={label} src={embedUrl(lat, lng)} loading="lazy" tabIndex={-1} className="pointer-events-none size-full border-0" />
      </span>
      <span className="flex items-center gap-2 px-3 py-2">
        <MapPin className="size-4 shrink-0 text-red-500" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block text-xs text-primary">{open}</span>
        </span>
      </span>
    </a>
  )
}

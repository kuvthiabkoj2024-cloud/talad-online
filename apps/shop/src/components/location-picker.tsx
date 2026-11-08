import type { GeoPoint } from '@talad/shared'
import { Button } from '@talad/ui/components/button'
import type { Circle, Map as LeafletMap, Marker } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Crosshair, LoaderCircle, MapPin, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/** Vientiane, where the map opens before anything is pinned. */
const START: GeoPoint = { latitude: 17.9757, longitude: 102.6331 }

export interface LocationPickerLabels {
  hint: string
  useCurrent: string
  remove: string
  locating: string
  locateFailed: string
}

/**
 * A pin on an OpenStreetMap map: tap the map or drag the pin, or use the device's location.
 * `radiusKm` draws a circle around the pin (e.g. a free delivery area).
 */
export function LocationPicker({
  value,
  onChange,
  radiusKm = 0,
  labels,
}: {
  value: GeoPoint | null
  onChange: (point: GeoPoint | null) => void
  radiusKm?: number
  labels: LocationPickerLabels
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const circle = useRef<Circle | null>(null)
  const leaflet = useRef<typeof import('leaflet') | null>(null)
  const change = useRef(onChange)
  change.current = onChange
  const [ready, setReady] = useState(false)
  const [locating, setLocating] = useState(false)
  const [failed, setFailed] = useState(false)

  // The map is made once; leaflet needs the browser, so it loads here.
  useEffect(() => {
    let cancelled = false
    void import('leaflet').then((L) => {
      if (cancelled || !box.current) return
      leaflet.current = L
      const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView(
        [value?.latitude ?? START.latitude, value?.longitude ?? START.longitude],
        value ? 15 : 12,
      )
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(m)
      m.on('click', (e) => change.current({ latitude: round(e.latlng.lat), longitude: round(e.latlng.lng) }))
      map.current = m
      setReady(true)
    })
    return () => {
      cancelled = true
      map.current?.remove()
      map.current = null
      marker.current = null
      circle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; the pin follows `value` below
  }, [])

  // Pin and circle follow the value.
  useEffect(() => {
    const L = leaflet.current
    const m = map.current
    if (!ready || !L || !m) return
    if (!value) {
      marker.current?.remove()
      circle.current?.remove()
      marker.current = null
      circle.current = null
      return
    }
    const at: [number, number] = [value.latitude, value.longitude]
    if (!marker.current) {
      marker.current = L.marker(at, { draggable: true, icon: pinIcon(L), autoPan: true }).addTo(m)
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng()
        change.current({ latitude: round(p.lat), longitude: round(p.lng) })
      })
      if (!m.getBounds().contains(at)) m.setView(at, Math.max(m.getZoom(), 15))
    } else marker.current.setLatLng(at)
    if (radiusKm > 0) {
      if (!circle.current) circle.current = L.circle(at, { radius: radiusKm * 1000, color: '#16a34a', weight: 1, fillOpacity: 0.08 }).addTo(m)
      else circle.current.setLatLng(at).setRadius(radiusKm * 1000)
    } else {
      circle.current?.remove()
      circle.current = null
    }
  }, [ready, value, radiusKm])

  const locate = () => {
    if (!navigator.geolocation) return setFailed(true)
    setLocating(true)
    setFailed(false)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false)
        const point = { latitude: round(pos.coords.latitude), longitude: round(pos.coords.longitude) }
        onChange(point)
        map.current?.setView([point.latitude, point.longitude], 16)
      },
      () => {
        setLocating(false)
        setFailed(true)
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className="relative z-0 h-64 w-full overflow-hidden rounded-xl border bg-muted" />
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <MapPin className="mt-px size-3.5 shrink-0" />
        {value ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : labels.hint}
      </p>
      {failed && <p className="text-xs text-destructive">{labels.locateFailed}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={locate} disabled={locating}>
          {locating ? <LoaderCircle className="animate-spin" /> : <Crosshair />}
          {locating ? labels.locating : labels.useCurrent}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => onChange(null)}>
            <X />
            {labels.remove}
          </Button>
        )}
      </div>
    </div>
  )
}

/** 6 decimals (~10 cm) — what the database keeps. */
const round = (n: number) => Math.round(n * 1e6) / 1e6

/** A CSS pin: leaflet's default marker images don't survive bundling. */
const pinIcon = (L: typeof import('leaflet')) =>
  L.divIcon({
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    html: '<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#16a34a;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  })

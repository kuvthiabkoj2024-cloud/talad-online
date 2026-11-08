import { PROVINCE_CODES, type ProvinceCode } from './address.js';

/**
 * A shop's own urgent delivery (it delivers itself, faster than a courier): the areas it
 * covers, each at its own price, how fast it is, and how far from the shop it delivers free.
 * Set in the Seller Center.
 */
export interface UrgentDelivery {
  enabled: boolean;
  /** Shown to the customer, e.g. "within 2 hours" / "ພາຍໃນ 2 ຊົ່ວໂມງ". */
  eta: string;
  zones: UrgentZone[];
  /**
   * Free within this many km (straight line) of the shop's pinned location; 0 = never free.
   * Beyond it, the areas' fees apply.
   */
  freeRadiusKm: number;
}

/** A point on the map (WGS 84). */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface UrgentZone {
  province: ProvinceCode;
  /** District names; empty = the whole province. */
  districts: string[];
  /** Kip, added to the shop's order total. */
  fee: number;
}

export const URGENT_RULES = {
  maxZones: 10,
  maxDistricts: 30,
  districtMax: 60,
  etaMax: 60,
  feeMax: 1_000_000,
  freeRadiusMaxKm: 50,
} as const;

/** Straight-line distance in km between two points (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** A real point, or null (stored coordinates are optional; 0,0 is not in Laos). */
export function geoPoint(latitude: unknown, longitude: unknown): GeoPoint | null {
  const lat = latitude === null || latitude === undefined ? NaN : Number(latitude);
  const lng = longitude === null || longitude === undefined ? NaN : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return { latitude: lat, longitude: lng };
}

/** Urgent delivery to an address: its fee (0 when free), and how far it is when both are pinned. */
export interface UrgentQuote {
  fee: number;
  /** Free because the address is within the shop's free radius. */
  free: boolean;
  distanceKm: number | null;
}

/** District names compared loosely: spacing and case don't matter ("Xaysettha" = "xay settha"). */
const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/[\s.\-_]+/g, '');

/**
 * Urgent delivery to this address, or null when the shop doesn't deliver urgently there.
 * Within the free radius of the shop (both pinned) it is free, even outside the areas;
 * otherwise a zone naming the address's district wins over a whole-province zone.
 */
export function urgentQuote(
  settings: UrgentDelivery | null | undefined,
  address: { province: string; district: string; location?: GeoPoint | null },
  shop?: GeoPoint | null,
): UrgentQuote | null {
  if (!settings?.enabled) return null;
  const km = shop && address.location ? distanceKm(shop, address.location) : null;
  if (km !== null && settings.freeRadiusKm > 0 && km <= settings.freeRadiusKm) return { fee: 0, free: true, distanceKm: km };
  const fee = urgentFee(settings, address);
  return fee === null ? null : { fee, free: false, distanceKm: km };
}

/**
 * The urgent delivery fee for the address's area, or null when no area covers it. A zone
 * naming the address's district wins over a whole-province zone.
 */
export function urgentFee(settings: UrgentDelivery | null | undefined, address: { province: string; district: string }): number | null {
  if (!settings?.enabled) return null;
  const inProvince = settings.zones.filter((z) => z.province === address.province);
  const district = norm(address.district);
  const named = inProvince.find((z) => z.districts.some((d) => norm(d) === district));
  const whole = inProvince.find((z) => z.districts.length === 0);
  const zone = named ?? whole;
  return zone ? zone.fee : null;
}

/** Free urgent delivery near a shop, as shown publicly (never the shop's coordinates). */
export interface FreeDeliveryOffer {
  radiusKm: number;
  /** How fast, as the shop wrote it (may be empty). */
  eta: string;
}

/** The shop's free nearby delivery, when it is on and the shop is pinned (stored JSON + its pin). */
export function freeDeliveryOffer(stored: unknown, shop: GeoPoint | null): FreeDeliveryOffer | null {
  const settings = parseUrgentDelivery(stored);
  if (!settings?.enabled || settings.freeRadiusKm <= 0 || !shop) return null;
  return { radiusKm: settings.freeRadiusKm, eta: settings.eta };
}

/** How far the customer's default address is from a shop offering free delivery nearby. */
export interface DeliveryDistance {
  /** The shop's free radius (null: the shop doesn't offer it). */
  radiusKm: number | null;
  /** The address checked (the default one), or null without any address. */
  addressId: string | null;
  /** Null when the address (or the shop) isn't pinned. */
  distanceKm: number | null;
  free: boolean;
}

/** Keeps only well-formed zones (stored settings are JSON). */
export function parseUrgentDelivery(value: unknown): UrgentDelivery | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<UrgentDelivery>;
  const zones = Array.isArray(v.zones) ? v.zones : [];
  const radius = Number(v.freeRadiusKm);
  return {
    // Stored before the free radius existed: never free.
    freeRadiusKm: Number.isFinite(radius) && radius > 0 ? Math.min(URGENT_RULES.freeRadiusMaxKm, Math.round(radius * 10) / 10) : 0,
    enabled: v.enabled === true,
    eta: typeof v.eta === 'string' ? v.eta.slice(0, URGENT_RULES.etaMax) : '',
    zones: zones
      .filter((z): z is UrgentZone => !!z && (PROVINCE_CODES as string[]).includes(z.province) && Number.isFinite(z.fee) && z.fee >= 0)
      .slice(0, URGENT_RULES.maxZones)
      .map((z) => ({
        province: z.province,
        districts: (Array.isArray(z.districts) ? z.districts : []).filter((d) => typeof d === 'string' && d.trim()).map((d) => d.trim()),
        fee: Math.round(z.fee),
      })),
  };
}

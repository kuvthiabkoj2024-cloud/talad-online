import { PROVINCE_CODES, type ProvinceCode } from './address.js';

/**
 * A shop's own urgent delivery (it delivers itself, faster than a courier): the areas it
 * covers, each at its own price, and how fast it is. Set in the Seller Center.
 */
export interface UrgentDelivery {
  enabled: boolean;
  /** Shown to the customer, e.g. "within 2 hours" / "ພາຍໃນ 2 ຊົ່ວໂມງ". */
  eta: string;
  zones: UrgentZone[];
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
} as const;

/** District names compared loosely: spacing and case don't matter ("Xaysettha" = "xay settha"). */
const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/[\s.\-_]+/g, '');

/**
 * The urgent delivery fee to this address, or null when the shop doesn't deliver urgently
 * there. A zone naming the address's district wins over a whole-province zone.
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

/** Keeps only well-formed zones (stored settings are JSON). */
export function parseUrgentDelivery(value: unknown): UrgentDelivery | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<UrgentDelivery>;
  const zones = Array.isArray(v.zones) ? v.zones : [];
  return {
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

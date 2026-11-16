/**
 * Dates in Lao that read the same everywhere.
 *
 * Chrome (desktop and Android) ships without Lao date data: `Intl.DateTimeFormat('lo-LA')`
 * silently falls back to American English ("Nov 15, 2026, 11:17 PM"), while Node and Safari
 * give Lao ("15 ພ.ຈ. 2026, 23:17"). So Lao dates are built here from the British English
 * parts (day-month-year, 24-hour clock) with Lao month and weekday names. Same output on the
 * server and in every browser, so server-rendered pages also hydrate cleanly.
 */

const LAO_MONTHS_LONG = ['ມັງກອນ', 'ກຸມພາ', 'ມີນາ', 'ເມສາ', 'ພຶດສະພາ', 'ມິຖຸນາ', 'ກໍລະກົດ', 'ສິງຫາ', 'ກັນຍາ', 'ຕຸລາ', 'ພະຈິກ', 'ທັນວາ'];
const LAO_MONTHS_SHORT = ['ມ.ກ.', 'ກ.ພ.', 'ມ.ນ.', 'ມ.ສ.', 'ພ.ພ.', 'ມິ.ຖ.', 'ກ.ລ.', 'ສ.ຫ.', 'ກ.ຍ.', 'ຕ.ລ.', 'ພ.ຈ.', 'ທ.ວ.'];
const LAO_WEEKDAYS_LONG = ['ວັນອາທິດ', 'ວັນຈັນ', 'ວັນອັງຄານ', 'ວັນພຸດ', 'ວັນພະຫັດ', 'ວັນສຸກ', 'ວັນເສົາ'];
const LAO_WEEKDAYS_SHORT = ['ອາທິດ', 'ຈັນ', 'ອັງຄານ', 'ພຸດ', 'ພະຫັດ', 'ສຸກ', 'ເສົາ'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const EN_WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export interface DateFormatter {
  format(date: Date | string | number): string;
}

const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

/**
 * `Intl.DateTimeFormat` for our two languages: English as en-GB ("15 Nov 2026, 23:17"),
 * Lao built by hand ("15 ພ.ຈ. 2026, 23:17"). Takes the usual options (incl. `timeZone`,
 * `dateStyle` / `timeStyle`).
 */
export function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions = {}): DateFormatter {
  const en = new Intl.DateTimeFormat('en-GB', options);
  if (locale !== 'lo') return { format: (d) => en.format(toDate(d)) };

  const longMonth = options.month === 'long' || options.dateStyle === 'long' || options.dateStyle === 'full';
  const longWeekday = options.weekday === 'long' || options.dateStyle === 'full';
  return {
    format: (d) =>
      en
        .formatToParts(toDate(d))
        .map((p) => {
          if (p.type === 'month' && !/^\d+$/.test(p.value)) {
            const i = EN_MONTHS.indexOf(p.value.slice(0, 3).toLowerCase());
            return i < 0 ? p.value : (longMonth ? LAO_MONTHS_LONG : LAO_MONTHS_SHORT)[i];
          }
          if (p.type === 'weekday') {
            const i = EN_WEEKDAYS.indexOf(p.value.slice(0, 3).toLowerCase());
            return i < 0 ? p.value : (longWeekday ? LAO_WEEKDAYS_LONG : LAO_WEEKDAYS_SHORT)[i];
          }
          // en-GB writes "Mon 26 Oct" and "15 Nov 2026 at 23:17" (long styles).
          if (p.type === 'literal') return p.value.replace(' at ', ', ');
          return p.value;
        })
        .join(''),
  };
}

/** "15 ພ.ຈ. 2026" / "15 Nov 2026", optionally with the time. */
export function formatDateTime(date: Date | string | number, locale: string, withTime = false): string {
  return dateFormatter(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime && { hour: '2-digit', minute: '2-digit' }),
  }).format(date);
}

const LAO_UNITS: Record<string, string> = { year: 'ປີ', month: 'ເດືອນ', week: 'ອາທິດ', day: 'ມື້', hour: 'ຊົ່ວໂມງ', minute: 'ນາທີ', second: 'ວິນາທີ' };

/** `Intl.RelativeTimeFormat` with the same fix: "3 ມື້ກ່ອນ" / "3 days ago". */
export function relativeTime(value: number, unit: Intl.RelativeTimeFormatUnit, locale: string, style: Intl.RelativeTimeFormatStyle = 'long'): string {
  if (locale !== 'lo') return new Intl.RelativeTimeFormat('en', { numeric: 'auto', style }).format(value, unit);
  const u = String(unit).replace(/s$/, '');
  if (value === 0) return u === 'day' ? 'ມື້ນີ້' : 'ຕອນນີ້';
  if (u === 'day' && value === -1) return 'ມື້ວານ';
  if (u === 'day' && value === 1) return 'ມື້ອື່ນ';
  const n = Math.abs(value);
  return value < 0 ? `${n} ${LAO_UNITS[u] ?? u}ກ່ອນ` : `ໃນອີກ ${n} ${LAO_UNITS[u] ?? u}`;
}

const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof WEEK)[number];
type Hours = Partial<Record<Day, { open: string; close: string }>>;

/** Weekday names for opening hours, Monday first. */
export const WEEKDAY_NAMES: Record<'lo' | 'en', Record<Day, string>> = {
  lo: { mon: 'ວັນຈັນ', tue: 'ວັນອັງຄານ', wed: 'ວັນພຸດ', thu: 'ວັນພະຫັດ', fri: 'ວັນສຸກ', sat: 'ວັນເສົາ', sun: 'ວັນອາທິດ' },
  en: { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' },
};

export interface OpenState {
  /** Open right now (Vientiane time). */
  open: boolean;
  /** Today's hours, if the shop opens today. */
  today: { open: string; close: string } | null;
  /** When it opens next, if it's closed now: the day (today or a later day) and time. */
  next: { day: Day; open: string; today: boolean } | null;
}

/** Whether a shop is open now and when it next opens; null when it hasn't set any hours. */
export function shopOpenState(hours: Hours | null | undefined, now: Date = new Date()): OpenState | null {
  if (!hours || !WEEK.some((d) => hours[d])) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Vientiane', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dayIndex = WEEK.indexOf(get('weekday').slice(0, 3).toLowerCase() as Day);
  const time = `${get('hour')}:${get('minute')}`;
  const today = hours[WEEK[dayIndex]] ?? null;
  const open = !!today && time >= today.open && time < today.close;
  let next: OpenState['next'] = null;
  if (!open) {
    if (today && time < today.open) next = { day: WEEK[dayIndex], open: today.open, today: true };
    else {
      for (let i = 1; i <= 7 && !next; i++) {
        const day = WEEK[(dayIndex + i) % 7];
        const h = hours[day];
        if (h) next = { day, open: h.open, today: false };
      }
    }
  }
  return { open, today, next };
}

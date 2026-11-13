import { StyleSheet, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';

/** "2026-11-13 08:00" in the phone's time zone. */
export function toLocalText(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** The typed "YYYY-MM-DD HH:mm" (time optional) as a date, or null when it isn't one. */
export function parseLocalText(text: string): Date | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(text.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0));
  return Number.isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d;
}

/**
 * A date and time typed as "YYYY-MM-DD HH:mm", with one-tap choices (now, in a week, end of the
 * month…), for coupon and flash sale dates.
 */
export function DateField({ label, value, onChange, presets = [] }: { label: string; value: string; onChange: (v: string) => void; presets?: { label: string; date: Date }[] }) {
  return (
    <Field label={label} hint="YYYY-MM-DD HH:mm">
      <Input value={value} onChangeText={onChange} autoCorrect={false} keyboardType="numbers-and-punctuation" placeholder="2026-12-31 23:59" />
      {presets.length > 0 && (
        <View style={styles.presets}>
          {presets.map((p) => (
            <Pill key={p.label} label={p.label} onPress={() => onChange(toLocalText(p.date))} />
          ))}
        </View>
      )}
    </Field>
  );
}

/** The end of today, in N days, and the month's last minute. */
export const datePresets = {
  endOfToday: () => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d;
  },
  inDays: (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(23, 59, 0, 0);
    return d;
  },
  endOfMonth: () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 0, 0);
  },
};

const styles = StyleSheet.create({
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});

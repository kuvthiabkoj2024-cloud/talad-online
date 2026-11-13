import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';

/** The website's notice colours: amber waits on you, green is good news, grey is closed, orange/red is a problem, sky is being checked. */
const TONES = {
  amber: { bg: '#fffbeb', fg: '#92400e', ring: '#fde68a' },
  green: { bg: '#e8f5e9', fg: '#1b5e20', ring: '#c8e6c9' },
  grey: { bg: '#f3f4f6', fg: '#374151', ring: '#e5e7eb' },
  orange: { bg: '#fff7ed', fg: '#9a3412', ring: '#fed7aa' },
  red: { bg: '#fef2f2', fg: '#b91c1c', ring: '#fecaca' },
  sky: { bg: '#f0f9ff', fg: '#075985', ring: '#bae6fd' },
} as const;

export type NoticeTone = keyof typeof TONES;

/** A coloured box with an icon, a title and a message (or anything below it). */
export function Notice({ tone, icon = 'alert', title, children }: { tone: NoticeTone; icon?: IconName; title?: string; children?: ReactNode }) {
  const c = TONES[tone];
  return (
    <View style={[styles.box, { backgroundColor: c.bg, borderColor: c.ring }]}>
      <Icon name={icon} size={20} color={c.fg} />
      <View style={styles.body}>
        {title && (
          <ThemedText type="smallBold" style={{ color: c.fg }}>
            {title}
          </ThemedText>
        )}
        {typeof children === 'string' ? (
          <ThemedText type="small" style={{ color: c.fg }}>
            {children}
          </ThemedText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: Spacing.two + 2, borderRadius: Radius.lg, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 4 },
  body: { flex: 1, gap: Spacing.one },
});

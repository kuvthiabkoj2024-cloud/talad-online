import { Icon } from '@/components/icon';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useI18n } from '@/lib/i18n';


/** A white card with a hairline border, like the website's `rounded-2xl bg-card ring-1`. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'outline';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const filled = variant === 'primary';
  const color = filled ? theme.onPrimary : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        filled ? { backgroundColor: theme.primary } : { borderColor: theme.primary, borderWidth: 1.5, backgroundColor: theme.card },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={color} /> : icon && <Icon name={icon} size={18} color={color} />}
      <ThemedText type="smallBold" style={{ color, fontSize: 15 }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Icon in a soft circle, a title, a line of help and an optional action (empty cart, no results…). */
export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <Card style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={30} color={theme.primary} />
      </View>
      <ThemedText type="smallBold" style={styles.center}>
        {title}
      </ThemedText>
      {body && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {body}
        </ThemedText>
      )}
      {action}
    </Card>
  );
}

export function Loading() {
  const theme = useTheme();
  return <ActivityIndicator style={styles.loading} color={theme.primary} />;
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      icon="offline"
      title={t.common.loadError}
      action={<Button label={t.common.retry} variant="outline" onPress={onRetry} style={styles.action} />}
    />
  );
}

/** Small pill: "-20%", a status, a selectable option. */
export function Pill({ label, tone = 'muted', selected, onPress }: { label: string; tone?: 'muted' | 'primary' | 'sale'; selected?: boolean; onPress?: () => void }) {
  const theme = useTheme();
  const colors =
    tone === 'sale'
      ? { bg: theme.sale, fg: '#ffffff', border: theme.sale }
      : tone === 'primary' || selected
        ? { bg: theme.primarySoft, fg: theme.primary, border: theme.primary }
        : { bg: theme.card, fg: theme.text, border: theme.border };
  const body = (
    <View style={[styles.pill, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <ThemedText type="caption" style={{ color: colors.fg, fontWeight: '700' }}>
        {label}
      </ThemedText>
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Section title with an optional action on the right ("Flash sale … ends in"). */
export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="subtitle">{title}</ThemedText>
      {right}
    </View>
  );
}

export type { IconName };

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg + 2,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  button: {
    minHeight: 48,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.four,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five, paddingHorizontal: Spacing.four },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  center: { textAlign: 'center' },
  loading: { paddingVertical: Spacing.six },
  action: { marginTop: Spacing.two },
  pill: { borderRadius: Radius.full, borderWidth: 1, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
});

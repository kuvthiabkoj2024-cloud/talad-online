import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, LoadError, Loading, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A seller screen's scrolling body with pull-to-refresh, its loading and error states. */
export function SellerScroll({
  loading,
  error,
  refreshing = false,
  onRefresh,
  children,
}: {
  loading?: boolean;
  error?: boolean;
  refreshing?: boolean;
  onRefresh: () => void;
  children?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
      {loading ? <Loading /> : error ? <LoadError onRetry={onRefresh} /> : children}
    </ScrollView>
  );
}

/** A row of choices (period, filter, tab), scrolling sideways when they don't fit. */
export function Choices<T extends string>({ value, options, onChange }: { value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choices}>
      {options.map((o) => (
        <Pill key={o.key} label={o.label} selected={value === o.key} onPress={() => onChange(o.key)} />
      ))}
    </ScrollView>
  );
}

/** A number with its label (and an optional line under it), as the Seller Center's stat cards. */
export function StatTile({ label, value, hint, hintColor, style }: { label: string; value: string; hint?: string; hintColor?: string; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <Card style={[styles.tile, style]}>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
        {label}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </ThemedText>
      {hint && (
        <ThemedText type="caption" style={{ color: hintColor ?? theme.textSecondary }} numberOfLines={2}>
          {hint}
        </ThemedText>
      )}
    </Card>
  );
}

/** Two tiles per row. */
export function TileGrid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** A label and its value on one line (summaries, money). */
export function KeyValue({ label, value, strong, muted, color }: { label: string; value: string; strong?: boolean; muted?: boolean; color?: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type={strong ? 'smallBold' : 'small'} themeColor={muted ? 'textSecondary' : 'text'} style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type={strong ? 'smallBold' : 'small'} themeColor={muted ? 'textSecondary' : 'text'} style={[styles.right, color ? { color } : null]}>
        {value}
      </ThemedText>
    </View>
  );
}

export const sellerStyles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two },
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  choices: { gap: Spacing.two, paddingVertical: 2 },
  tile: { flexBasis: '47%', flexGrow: 1, padding: Spacing.three, gap: 2 },
  value: { fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  right: { textAlign: 'right', fontVariant: ['tabular-nums'] },
});

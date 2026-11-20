import type { NotificationData } from '@talad/shared';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateTime } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/** A notification as the API lists it (customer list and shop inbox alike). */
export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data: NotificationData;
  readAt: string | null;
  createdAt: string;
}

/** An icon per type, coloured like the order status shortcuts. */
const LOOK: Record<string, { icon: IconName; color: string; tint: string }> = {
  ORDER: { icon: 'package', color: '#2563eb', tint: 'rgba(37,99,235,0.14)' },
  PROMOTION: { icon: 'megaphone', color: '#d97706', tint: 'rgba(245,158,11,0.16)' },
  PRICE_DROP: { icon: 'tag', color: '#dc2626', tint: 'rgba(220,38,38,0.12)' },
  ACTIVITY: { icon: 'heart', color: '#db2777', tint: 'rgba(219,39,119,0.12)' },
  SHOP_STATUS: { icon: 'shop', color: '#2e7d32', tint: 'rgba(46,125,50,0.14)' },
  SYSTEM: { icon: 'bell', color: '#7c3aed', tint: 'rgba(124,58,237,0.14)' },
};

/** One notification: type icon (or its picture), title and text in the app's language, time, unread dot. */
export function NotificationRow({ item, divider, onPress }: { item: NotificationItem; divider: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { locale } = useI18n();
  const text = item.data?.i18n?.[locale] ?? { title: item.title, body: item.body };
  const look = LOOK[item.type] ?? LOOK.SYSTEM!;
  const unread = !item.readAt;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        unread && { backgroundColor: theme.primarySoft },
        pressed && styles.pressed,
      ]}>
      <View style={[styles.icon, { backgroundColor: look.tint }]}>
        {item.data?.imageUrl ? <Image source={item.data.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name={look.icon} size={20} color={look.color} />}
      </View>
      <View style={styles.flex}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {text.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
          {text.body}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {dateTime(item.createdAt, locale)}
        </ThemedText>
      </View>
      {unread && <View style={[styles.dot, { backgroundColor: theme.sale }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, padding: Spacing.three },
  pressed: { opacity: 0.75 },
  icon: { width: 44, height: 44, borderRadius: Radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
});

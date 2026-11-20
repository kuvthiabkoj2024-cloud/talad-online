import type { NotificationData, NotificationFrom } from '@talad/shared';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { avatarSrc } from '@/lib/api';
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
  /** Who it's from: MC Mart, a shop (its logo) or a customer (their photo). */
  from?: NotificationFrom;
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

/**
 * One notification, as Facebook shows them: who it's from (MC Mart's logo, the shop's logo or the
 * customer's photo) with a small badge for its kind, the title and text in the app's language,
 * the time and an unread dot. Tapping it marks it read and shows the whole text; it doesn't open
 * anything (opening screens from the list stacked them up).
 */
export function NotificationRow({ item, divider, onPress }: { item: NotificationItem; divider: boolean; onPress: () => void }) {
  const theme = useTheme();
  const { locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const text = item.data?.i18n?.[locale] ?? { title: item.title, body: item.body };
  const look = LOOK[item.type] ?? LOOK.SYSTEM!;
  const unread = !item.readAt;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={() => {
        setExpanded(true);
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
        unread && { backgroundColor: theme.primarySoft },
        pressed && styles.pressed,
      ]}>
      <View>
        <Avatar from={item.from} fallbackImage={item.data?.imageUrl} />
        <View style={[styles.kind, { backgroundColor: look.color, borderColor: theme.card }]}>
          <Icon name={look.icon} size={11} color="#ffffff" strokeWidth={2.5} />
        </View>
      </View>
      <View style={styles.flex}>
        <ThemedText type="smallBold" numberOfLines={expanded ? undefined : 2}>
          {text.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={expanded ? undefined : 3}>
          {text.body}
        </ThemedText>
        <ThemedText type="caption" style={{ color: unread ? theme.primary : theme.textSecondary }}>
          {dateTime(item.createdAt, locale)}
        </ThemedText>
      </View>
      {unread && <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
    </Pressable>
  );
}

/** MC Mart's logo on green, the shop's logo, or the customer's photo (else their initials). */
function Avatar({ from, fallbackImage }: { from?: NotificationFrom; fallbackImage?: string }) {
  const theme = useTheme();
  if (!from || from.kind === 'mcmart') {
    if (!from && fallbackImage) return <Image source={fallbackImage} style={styles.avatar} contentFit="cover" />;
    return (
      <LinearGradient colors={['#43a047', '#1b5e20']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.avatar, styles.center]}>
        <Image source={require('@/assets/images/brand-logo.png')} style={styles.brand} contentFit="contain" />
      </LinearGradient>
    );
  }
  const src = from.kind === 'shop' ? from.imageUrl : avatarSrc({ id: from.id, avatarUrl: from.avatarUrl, avatarVersion: from.avatarVersion });
  if (src) return <Image source={src} style={[styles.avatar, { backgroundColor: theme.backgroundElement }]} contentFit="cover" />;
  return (
    <View style={[styles.avatar, styles.center, { backgroundColor: theme.primarySoft }]}>
      {from.kind === 'shop' ? (
        <Icon name="shop" size={22} color={theme.primary} />
      ) : (
        <ThemedText type="smallBold" themeColor="primary">
          {from.name
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase()}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, padding: Spacing.three },
  pressed: { opacity: 0.75 },
  avatar: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center' },
  brand: { width: 28, height: 28 },
  kind: { position: 'absolute', right: -3, bottom: -3, width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
});

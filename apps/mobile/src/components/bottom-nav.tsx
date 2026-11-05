import { Icon } from '@/components/icon';
import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import type { IconName } from '@/components/ui';
import { useCartCount } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

type BarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Height of the bar above the home indicator. */
export const BOTTOM_NAV_HEIGHT = 64;

/**
 * The website's phone tab bar: Home, Video, Market Chat (a raised green bubble in the middle),
 * Cart with its count, and Profile (the customer's initials once signed in). Market Chat has its
 * own composer at the bottom, so the bar steps aside there, as on the website.
 */
export function BottomNav({ state, navigation }: BarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { customer } = useAuth();
  const cartCount = useCartCount();
  const current = state.routes[state.index]?.name;
  if (current === 'chat') return null;

  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (current !== name && !event.defaultPrevented) navigation.navigate(name);
  };
  const initials = customer?.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const tab = (name: string, label: string, icon: IconName, activeIcon: IconName, extra?: { badge?: number; avatar?: boolean }) => {
    const active = current === name;
    const color = active ? theme.primary : theme.textSecondary;
    return (
      <Pressable key={name} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label} onPress={() => go(name)} style={styles.tab}>
        {active && <View style={[styles.indicator, { backgroundColor: theme.primary }]} />}
        <View>
          {extra?.avatar && initials ? (
            <View style={[styles.avatar, { backgroundColor: theme.primary }, active && { borderColor: theme.primary, borderWidth: 2 }]}>
              <ThemedText style={styles.initials}>{initials}</ThemedText>
            </View>
          ) : (
            <Icon name={active ? activeIcon : icon} size={24} color={color} strokeWidth={active ? 2.5 : 2} />
          )}
          {!!extra?.badge && (
            <View style={[styles.badge, { backgroundColor: theme.sale }]}>
              <ThemedText style={styles.badgeText}>{extra.badge > 99 ? '99+' : extra.badge}</ThemedText>
            </View>
          )}
        </View>
        <ThemedText numberOfLines={1} style={[styles.label, { color }]}>
          {label}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom }]}>
      {tab('index', t.tabs.home, 'home', 'home')}
      {tab('feed', t.tabs.feed, 'video', 'video')}
      <Pressable accessibilityRole="tab" accessibilityLabel={t.tabs.chat} onPress={() => go('chat')} style={styles.tab}>
        <View style={[styles.bubble, { borderColor: theme.card, shadowColor: theme.primary }]}>
          <LinearGradient colors={['#43a047', '#1b5e20']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bubbleFill}>
            <Icon name="chat" size={28} color="#ffffff" strokeWidth={2.25} />
          </LinearGradient>
        </View>
        <ThemedText numberOfLines={1} style={[styles.label, styles.chatLabel, { color: theme.textSecondary }]}>
          {t.tabs.chat}
        </ThemedText>
      </Pressable>
      {tab('cart', t.tabs.cart, 'cart', 'cart', { badge: cartCount })}
      {tab('account', t.tabs.account, 'account', 'account', { avatar: true })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    // The website's soft shadow above the bar.
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  tab: { flex: 1, height: BOTTOM_NAV_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11, lineHeight: 16, fontWeight: '700' },
  chatLabel: { position: 'absolute', bottom: 6 },
  // Raised above the bar, ringed with the bar's colour, like the website's green bubble.
  bubble: {
    position: 'absolute',
    top: -20,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 4,
    backgroundColor: '#1b5e20',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bubbleFill: { flex: 1, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  indicator: { position: 'absolute', top: 0, width: 28, height: 3, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  avatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#ffffff', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  badge: { position: 'absolute', top: -5, right: -11, minWidth: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center' },
  badgeText: { color: '#ffffff', fontSize: 10, lineHeight: 17, fontWeight: '700' },
});

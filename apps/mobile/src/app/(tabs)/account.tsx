import { Icon } from '@/components/icon';
import { useQuery } from '@tanstack/react-query';
import { formatPhone } from '@talad/shared';
import { Image } from 'expo-image';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, type IconName } from '@/components/ui';
import { BrandGreen, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, avatarSrc, SITE_URL } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { THEME_MODES, useThemeMode } from '@/lib/theme-mode';

/** Profile: who's signed in and the website's account menu, then language and signing out. */
export default function AccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useThemeMode();
  const { customer, signOut } = useAuth();
  const unread = useQuery({ queryKey: ['me', 'messages-unread'], queryFn: () => api<{ count: number }>('/me/conversations/unread-count'), enabled: !!customer, refetchInterval: 30_000 });
  const orderCounts = useQuery({
    queryKey: ['me', 'orders', 'all'],
    queryFn: () => api<{ counts: Partial<Record<string, number>> }>('/me/orders?pageSize=1'),
    enabled: !!customer,
  });
  const photo = customer && avatarSrc(customer);
  // The website's order shortcuts: each opens order history on that tab.
  const shortcuts: { status: 'to-pay' | 'to-ship' | 'to-receive' | 'completed'; icon: IconName }[] = [
    { status: 'to-pay', icon: 'wallet' },
    { status: 'to-ship', icon: 'package' },
    { status: 'to-receive', icon: 'truck' },
    { status: 'completed', icon: 'done' },
  ];
  const initials = customer?.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const confirmSignOut = () =>
    Alert.alert(t.acct.logoutTitle, t.acct.logoutBody, [
      { text: t.acct.cancel, style: 'cancel' },
      { text: t.account.signOut, style: 'destructive', onPress: () => void signOut() },
    ]);

  // The website's account menu, in its order.
  const menu: { icon: IconName; label: string; href: Href; badge?: number }[] = [
    { icon: 'user', label: t.acct.profile, href: '/profile' },
    { icon: 'package', label: t.acct.orders, href: '/orders' },
    { icon: 'track', label: t.acct.trackOrder, href: '/track' },
    { icon: 'points', label: t.acct.points, href: '/points' },
    { icon: 'chats', label: t.acct.messages, href: '/messages', badge: unread.data?.count },
    { icon: 'shop', label: t.acct.following, href: '/following' },
    { icon: 'location', label: t.acct.addresses, href: '/addresses' },
    { icon: 'bank', label: t.acct.bankAccounts, href: '/bank-accounts' },
  ];

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={[styles.hero, { paddingTop: insets.top + Spacing.four }]}>
        {customer ? (
          <Pressable onPress={() => router.push('/profile')} style={styles.who}>
            <View style={styles.avatar}>
              {photo ? <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" /> : <ThemedText style={styles.initials}>{initials}</ThemedText>}
            </View>
            <View style={styles.flex}>
              <ThemedText type="subtitle" style={styles.onGreen} numberOfLines={1}>
                {customer.name}
              </ThemedText>
              {customer.phone && (
                <ThemedText type="small" style={styles.onGreenSoft}>
                  {formatPhone(customer.phone)}
                </ThemedText>
              )}
            </View>
            <Icon name="chevron-right" size={20} color="#ffffff" />
          </Pressable>
        ) : (
          <View style={styles.who}>
            <Image source={require('@/assets/images/brand-logo.png')} style={styles.logo} contentFit="contain" />
            <ThemedText type="small" style={[styles.onGreen, styles.flex]}>
              {t.account.signInBody}
            </ThemedText>
          </View>
        )}
      </View>

      <View style={styles.body}>
        {/* Not signed in: selling on MC Mart first, then signing in right under it. */}
        {!customer && (
          <>
            <Card>
              <Row
                icon="shop"
                label={t.acct.openShop}
                sub={t.acct.openShopDescription}
                accent
                onPress={() => router.push('/seller/register')}
              />
            </Card>
            <Button label={t.account.signIn} icon="log-in" onPress={() => router.push('/login')} />
          </>
        )}
        {customer && (
          <Card>
            <View style={[styles.ordersHead, { borderBottomColor: theme.border }]}>
              <ThemedText type="smallBold">{t.acct.orders}</ThemedText>
              <Pressable onPress={() => router.push('/orders')} hitSlop={8} style={styles.inline}>
                <ThemedText type="caption" themeColor="textSecondary">
                  {t.acct.viewAllOrders}
                </ThemedText>
                <Icon name="chevron-right" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>
            <View style={styles.shortcuts}>
              {shortcuts.map(({ status, icon }) => {
                const n = orderCounts.data?.counts[status] ?? 0;
                return (
                  <Pressable key={status} onPress={() => router.push({ pathname: '/orders', params: { status } })} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
                    <View>
                      <View style={[styles.shortcutIcon, { backgroundColor: theme.primarySoft }]}>
                        <Icon name={icon} size={22} color={theme.primary} />
                      </View>
                      {n > 0 && (
                        <View style={[styles.dotBadge, { backgroundColor: theme.sale, borderColor: theme.card }]}>
                          <ThemedText style={styles.badgeText}>{n > 99 ? '99+' : n}</ThemedText>
                        </View>
                      )}
                    </View>
                    <ThemedText type="caption" numberOfLines={2} style={styles.shortcutLabel}>
                      {t.acct.orderTabs[status]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}
        {customer && (
          <Card>
            <Row icon="video" label={t.acct.myVideoProfile} onPress={() => router.push(`/u/${customer.id}`)} />
            {menu.map((item, i) => (
              <Row key={item.label} icon={item.icon} label={item.label} badge={item.badge} divider onPress={() => router.push(item.href)} />
            ))}
            {/* Accounts can sell too: open a shop, or manage it (seller screens, same sign-in). */}
            <Row
              icon="shop"
              label={customer.shop ? t.acct.myShop : t.acct.openShop}
              sub={customer.shop ? customer.shop.name : t.acct.openShopDescription}
              accent
              divider
              onPress={() => router.push(customer.shop ? '/seller' : '/seller/register')}
            />
          </Card>
        )}
        <Card>
          <Row
            icon="language"
            label={t.account.language}
            right={
              <View style={styles.langs}>
                {(['lo', 'en'] as const).map((l) => (
                  <Pressable
                    key={l}
                    accessibilityRole="button"
                    accessibilityState={{ selected: locale === l }}
                    onPress={() => setLocale(l)}
                    style={[styles.lang, { borderColor: theme.border }, locale === l && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                    <ThemedText type="caption" style={{ color: locale === l ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                      {l === 'lo' ? 'ລາວ' : 'EN'}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            }
          />
          <Row
            icon="theme"
            label={t.account.theme}
            divider
            right={
              <View style={styles.langs}>
                {THEME_MODES.map((m) => (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === m }}
                    onPress={() => setMode(m)}
                    style={[styles.lang, styles.themeOption, { borderColor: theme.border }, mode === m && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                    <ThemedText type="caption" style={{ color: mode === m ? theme.onPrimary : theme.text, fontWeight: '700' }}>
                      {t.account.themes[m]}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            }
          />
          <Row icon="globe" label={t.account.website} onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/${locale}`)} divider />
        </Card>
        {customer && (
          <Card>
            <Row icon="log-out" label={t.account.signOut} danger onPress={confirmSignOut} />
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  onPress,
  right,
  divider,
  danger,
  badge,
  sub,
  accent,
}: {
  icon: IconName;
  label: string;
  /** A second, smaller line. */
  sub?: string;
  /** The icon in brand green (selling on MC Mart). */
  accent?: boolean;
  onPress?: () => void;
  right?: ReactNode;
  divider?: boolean;
  danger?: boolean;
  badge?: number;
}) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={danger ? theme.sale : accent ? theme.primary : theme.textSecondary} />
      <View style={styles.flex}>
        <ThemedText type="small" style={{ color: danger ? theme.sale : theme.text }}>
          {label}
        </ThemedText>
        {sub && (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {sub}
          </ThemedText>
        )}
      </View>
      {!!badge && (
        <View style={[styles.badge, { backgroundColor: theme.sale }]}>
          <ThemedText style={styles.badgeText}>{badge > 99 ? '99+' : badge}</ThemedText>
        </View>
      )}
      {right ?? (onPress && !danger && <Icon name="chevron-right" size={18} color={theme.textSecondary} />)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingBottom: Spacing.four },
  hero: { backgroundColor: BrandGreen, paddingHorizontal: Spacing.three, paddingBottom: Spacing.five },
  who: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: BrandGreen, fontSize: 22, lineHeight: 30, fontWeight: '800' },
  logo: { width: 52, height: 52 },
  onGreen: { color: '#ffffff' },
  onGreenSoft: { color: 'rgba(255,255,255,0.8)' },
  body: { padding: Spacing.three, gap: Spacing.three, marginTop: -Spacing.four },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, minHeight: 56 },
  inline: { flexDirection: 'row', alignItems: 'center' },
  ordersHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  shortcuts: { flexDirection: 'row', paddingVertical: Spacing.three },
  shortcut: { flex: 1, alignItems: 'center', gap: Spacing.one + 2, paddingHorizontal: 2 },
  shortcutIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  shortcutLabel: { textAlign: 'center' },
  dotBadge: { position: 'absolute', top: -6, right: -8, minWidth: 20, borderRadius: 10, borderWidth: 2, paddingHorizontal: 4, alignItems: 'center' },
  pressed: { opacity: 0.7 },
  langs: { flexDirection: 'row', gap: Spacing.one },
  lang: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 2 },
  // Three choices share the row with the label: a little narrower than the language ones.
  themeOption: { paddingHorizontal: Spacing.two },
  badge: { minWidth: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center' },
  badgeText: { color: '#ffffff', fontSize: 11, lineHeight: 20, fontWeight: '700' },
});

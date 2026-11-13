import { Image } from 'expo-image';
import { Stack, useRouter, type Href } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { BrandGreen, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { count } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useMyShop, useShopBadges, useShopSummary, useShopUnread } from '@/lib/seller';
import { useSellerI18n } from '@/lib/seller-i18n';

type ToolKey = keyof ReturnType<typeof useSellerI18n>['s']['nav'];

/** The Seller Center's menu, in its order. `href`: built in the app; the rest are on their way. */
const TOOLS: { key: ToolKey; icon: IconName; href?: Href }[] = [
  { key: 'stats', icon: 'chart', href: '/seller/stats' },
  { key: 'products', icon: 'package', href: '/seller/products' },
  { key: 'videos', icon: 'video', href: '/seller/videos' },
  { key: 'orders', icon: 'receipt', href: '/seller/orders' },
  { key: 'cod', icon: 'coins', href: '/seller/cod' },
  { key: 'messages', icon: 'chats', href: '/seller/messages' },
  { key: 'coupons', icon: 'coupon', href: '/seller/coupons' },
  { key: 'marketing', icon: 'megaphone', href: '/seller/marketing' },
  { key: 'customers', icon: 'users', href: '/seller/customers' },
  { key: 'finance', icon: 'wallet', href: '/seller/finance' },
  { key: 'reviews', icon: 'star', href: '/seller/reviews' },
  { key: 'chatbot', icon: 'bot', href: '/seller/chatbot' },
  { key: 'profile', icon: 'shop', href: '/seller/profile' },
  { key: 'security', icon: 'shield', href: '/seller/security' },
];

/**
 * Seller home (§3), as the Seller Center shows it on phones: the shop on the brand colour, what
 * needs attention, order counts and every shop tool. Same account as shopping: no second sign-in.
 */
export default function SellerHomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { s, t, locale } = useSellerI18n();
  const { customer } = useAuth();
  const owner = !!customer?.shop;
  const shop = useMyShop(owner);
  const summary = useShopSummary();
  const badges = useShopBadges();
  const unread = useShopUnread();

  if (!owner) {
    return (
      <View style={[styles.pad, { backgroundColor: theme.background, flex: 1 }]}>
        <Stack.Screen options={{ title: s.home.title }} />
        {customer ? (
          <EmptyState icon="shop" title={s.home.notSeller} />
        ) : (
          <EmptyState icon="log-in" title={t.account.signIn} action={<Button label={t.account.signIn} onPress={() => router.push('/login')} style={styles.signIn} />} />
        )}
      </View>
    );
  }

  const badge: Partial<Record<ToolKey, number>> = { orders: badges.data?.orders, videos: badges.data?.videos, messages: unread.data };
  const o = summary.data?.orders;
  const counters: { label: string; value?: number; tab: string }[] = [
    { label: s.home.toPay, value: o?.toPay, tab: 'to-pay' },
    { label: s.home.toShip, value: o?.toShip, tab: 'to-ship' },
    { label: s.home.shipping, value: o?.shipping, tab: 'shipping' },
    { label: s.home.returns, value: o?.returns, tab: 'returns' },
  ];

  const alerts: { icon: IconName; title: string; body?: string; danger?: boolean; action?: string }[] = [];
  const d = shop.data;
  if (d?.status === 'PENDING') alerts.push({ icon: 'clock', title: s.home.pendingTitle, body: s.home.pendingBody, action: s.register.viewApplication });
  if (d?.status === 'REJECTED') alerts.push({ icon: 'alert', title: s.home.rejectedTitle, body: d.rejectionReason ?? undefined, danger: true, action: s.register.updateApplication });
  if (d?.status === 'SUSPENDED') alerts.push({ icon: 'alert', title: s.home.suspendedTitle, body: s.home.suspendedBody, danger: true });
  if (d?.status === 'APPROVED' && summary.data && !summary.data.setup.pickupAddress) alerts.push({ icon: 'location', title: s.home.pickupTitle, body: s.home.pickupBody });
  if (summary.data && !summary.data.setup.payment) alerts.push({ icon: 'bank', title: s.home.paymentTitle, body: s.home.paymentBody });

  const refresh = () => Promise.all([shop.refetch(), summary.refetch(), badges.refetch(), unread.refetch()]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => void refresh()} tintColor={theme.primary} />}>
      <Stack.Screen options={{ title: s.home.title }} />
      <View style={[styles.hero, { backgroundColor: BrandGreen }]}>
        <View style={styles.logo}>
          {d?.logoUrl ? <Image source={d.logoUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="shop" size={28} color={BrandGreen} />}
        </View>
        <View style={styles.flex}>
          <ThemedText type="subtitle" style={styles.onBrand} numberOfLines={1}>
            {d?.name ?? customer.shop?.name}
          </ThemedText>
          {d && (
            <View style={styles.inline}>
              <View style={[styles.dot, { backgroundColor: d.status === 'APPROVED' ? '#34d399' : d.status === 'PENDING' ? '#fbbf24' : '#f87171' }]} />
              <ThemedText type="small" style={styles.onBrandSoft}>
                {s.shopStatus[d.status]} · {fill(s.home.followers, { n: count(d.followerCount, locale) })}
              </ThemedText>
            </View>
          )}
        </View>
      </View>

      <View style={styles.body}>
        {shop.isError && <LoadError onRetry={() => void refresh()} />}
        {shop.isPending && <Loading />}

        {alerts.map((a) => (
          <View
            key={a.title}
            style={[styles.alert, { backgroundColor: a.danger ? '#fef2f2' : '#fffbeb', borderColor: a.danger ? '#fecaca' : '#fde68a' }]}>
            <Icon name={a.icon} size={22} color={a.danger ? '#b91c1c' : '#b45309'} />
            <View style={styles.flex}>
              <ThemedText type="smallBold" style={{ color: a.danger ? '#7f1d1d' : '#78350f' }}>
                {a.title}
              </ThemedText>
              {a.body && (
                <ThemedText type="caption" style={{ color: a.danger ? '#991b1b' : '#92400e' }}>
                  {a.body}
                </ThemedText>
              )}
            </View>
            {a.action && (
              <Pressable accessibilityRole="button" onPress={() => router.push('/seller/register')} style={styles.alertAction}>
                <ThemedText type="caption" style={styles.alertActionText}>
                  {a.action}
                </ThemedText>
              </Pressable>
            )}
          </View>
        ))}

        <Card style={styles.counters}>
          {counters.map((c) => (
            <Pressable
              key={c.tab}
              accessibilityRole="button"
              style={styles.counter}
              onPress={() => router.push({ pathname: '/seller/orders', params: { tab: c.tab } })}>
              <ThemedText type="subtitle" themeColor="primary" style={styles.counterValue}>
                {c.value ?? '–'}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
                {c.label}
              </ThemedText>
            </Pressable>
          ))}
        </Card>

        <ThemedText type="smallBold">{s.home.tools}</ThemedText>
        <View style={styles.grid}>
          {TOOLS.map((tool) => {
            const n = badge[tool.key] ?? 0;
            return (
              <Pressable
                key={tool.key}
                accessibilityRole="button"
                accessibilityLabel={s.nav[tool.key]}
                onPress={() =>
                  tool.href ? router.push(tool.href) : Alert.alert(s.home.soonTitle, fill(s.home.soonBody, { tool: s.nav[tool.key] }))
                }
                style={({ pressed }) => [styles.tile, { backgroundColor: theme.card, borderColor: theme.border }, pressed && { opacity: 0.7 }]}>
                <View style={[styles.tileIcon, { backgroundColor: theme.primarySoft }, !tool.href && styles.dim]}>
                  <Icon name={tool.icon} size={22} color={theme.primary} />
                  {n > 0 && (
                    <View style={[styles.badge, { backgroundColor: theme.sale, borderColor: theme.card }]}>
                      <ThemedText style={styles.badgeText}>{n > 99 ? '99+' : n}</ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText type="caption" style={[styles.center, !tool.href && { color: theme.textSecondary }]} numberOfLines={2}>
                  {s.nav[tool.key]}
                </ThemedText>
                {!tool.href && (
                  <ThemedText style={[styles.soon, { color: theme.textSecondary }]}>{s.home.soon}</ThemedText>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  scroll: { paddingBottom: Spacing.six },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingTop: Spacing.three, paddingBottom: Spacing.four },
  logo: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#ffffff', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  onBrand: { color: '#ffffff' },
  onBrandSoft: { color: 'rgba(255,255,255,0.9)' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  body: { padding: Spacing.three, gap: Spacing.three },
  alert: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: Radius.md + 2, padding: Spacing.three },
  counters: { flexDirection: 'row', paddingVertical: Spacing.three },
  counter: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 2 },
  counterValue: { fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    width: '23%',
    flexGrow: 1,
    maxWidth: '24%',
    alignItems: 'center',
    gap: Spacing.one + 2,
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.three,
    paddingHorizontal: 2,
  },
  tileIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dim: { opacity: 0.55 },
  badge: { position: 'absolute', top: -6, right: -10, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#ffffff', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  soon: { fontSize: 10, lineHeight: 12 },
  alertAction: { backgroundColor: '#ea580c', borderRadius: Radius.full, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one + 2 },
  alertActionText: { color: '#ffffff', fontWeight: '700' },
  signIn: { marginTop: Spacing.two, alignSelf: 'stretch' },
});

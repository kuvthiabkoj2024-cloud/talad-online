import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { isOrderTab, type OrderTab } from '@talad/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, type OrderSummary } from '@/lib/api';
import { date, money } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

const TABS = ['all', 'to-pay', 'to-ship', 'to-receive', 'completed', 'cancelled', 'refund'] as const;

/**
 * The customer's orders, newest first, with the website's status tabs (`?status=to-pay`…) and
 * their counts. Tapping one opens its details (tracking, payment, returns) in the app.
 */
export default function OrdersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { status } = useLocalSearchParams<{ status?: string }>();
  const active: OrderTab | 'all' = isOrderTab(status) ? status : 'all';
  const orders = useQuery({
    queryKey: ['me', 'orders', active],
    queryFn: () => api<{ orders: OrderSummary[]; counts: Partial<Record<OrderTab | 'all', number>> }>(`/me/orders?pageSize=30${active === 'all' ? '' : `&tab=${active}`}`),
  });

  return (
    <>
      <Stack.Screen options={{ title: t.orders.title }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={() => void orders.refetch()} tintColor={theme.primary} />}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((tab) => {
            const n = orders.data?.counts[tab] ?? 0;
            return <Pill key={tab} label={n > 0 ? `${t.acct.orderTabs[tab]} ${n}` : t.acct.orderTabs[tab]} selected={tab === active} onPress={() => router.setParams({ status: tab === 'all' ? undefined : tab })} />;
          })}
        </ScrollView>
        {orders.isPending && <Loading />}
        {orders.isError && <LoadError onRetry={() => void orders.refetch()} />}
        {orders.data && !orders.data.orders.length && (active === 'all' ? <EmptyState icon="package" title={t.orders.empty} body={t.orders.emptyBody} /> : <EmptyState icon="package" title={t.acct.noOrdersInTab} body={t.acct.noOrdersInTabBody} />)}
        {orders.data?.orders.map((o) => (
          <Pressable key={o.number} onPress={() => router.push({ pathname: '/orders/[number]', params: { number: o.number } })}>
            {({ pressed }) => (
              <Card style={[styles.card, pressed && styles.pressed]}>
                <View style={styles.head}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                    {o.shop.name}
                  </ThemedText>
                  <Pill tone={o.status === 'CANCELLED' ? 'muted' : 'primary'} label={t.orders.status[o.status as keyof typeof t.orders.status] ?? o.status} />
                </View>
                {o.items.map((item) => (
                  <View key={item.sku} style={styles.item}>
                    <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                      {item.imageUrl && <Image source={item.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
                    </View>
                    <View style={styles.flex}>
                      <ThemedText type="small" numberOfLines={1}>
                        {item.name}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {item.variant ? `${item.variant} · ` : ''}x{item.quantity}
                      </ThemedText>
                    </View>
                  </View>
                ))}
                <View style={[styles.foot, { borderTopColor: theme.border }]}>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {o.number} · {date(o.createdAt, locale)}
                  </ThemedText>
                  <ThemedText type="smallBold" themeColor="primary">
                    {o.itemCount === 1 ? t.orders.itemOne : fill(t.orders.itemMany, { n: o.itemCount })} · {money(o.total)}
                  </ThemedText>
                </View>
              </Card>
            )}
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  tabs: { gap: Spacing.two },
  card: { padding: Spacing.three, gap: Spacing.two },
  pressed: { opacity: 0.85 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  thumb: { width: 48, height: 48, borderRadius: 8, overflow: 'hidden' },
  foot: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: 2 },
});

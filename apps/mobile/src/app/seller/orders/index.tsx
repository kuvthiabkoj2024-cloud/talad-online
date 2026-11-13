import { isShopOrderTab, SHOP_ORDER_TABS, type ShopOrderTab } from '@talad/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { OrderStatusPill } from '@/components/seller/order-status';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { sellerKeys, useClearBadge, type ShopOrderList, type ShopOrderSummary } from '@/lib/seller';
import { useSellerI18n } from '@/lib/seller-i18n';

type Tab = ShopOrderTab | 'all';
const TABS: Tab[] = ['all', ...(Object.keys(SHOP_ORDER_TABS) as ShopOrderTab[])];
const PAGE_SIZE = 20;

/** The shop's orders by status (§3.6), as in the Seller Center: tabs with counts, search, newest first. */
export default function SellerOrdersScreen() {
  const theme = useTheme();
  const { s } = useSellerI18n();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(isShopOrderTab(params.tab) ? params.tab : 'all');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useClearBadge('orders');

  // Search once typing pauses.
  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(id);
  }, [typed]);

  const list = useInfiniteQuery({
    queryKey: [...sellerKeys.orders, { tab, q }],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ page: String(pageParam), pageSize: String(PAGE_SIZE) });
      if (tab !== 'all') query.set('tab', tab);
      if (q) query.set('q', q);
      return api<ShopOrderList>(`/me/shop/orders?${query}`);
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const orders = list.data?.pages.flatMap((p) => p.items) ?? [];
  const counts = list.data?.pages[0]?.counts;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: s.orders.title }} />
      <View style={styles.top}>
        <View style={styles.search}>
          <Input value={typed} onChangeText={setTyped} placeholder={s.orders.search} returnKeyType="search" autoCorrect={false} style={styles.searchInput} />
          <View style={styles.searchIcon} pointerEvents="none">
            <Icon name="search" size={18} color={theme.textSecondary} />
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((key) => (
            <Pill
              key={key}
              label={counts && counts[key] > 0 ? `${s.orders.tabs[key]} ${counts[key]}` : s.orders.tabs[key]}
              selected={tab === key}
              onPress={() => setTab(key)}
            />
          ))}
        </ScrollView>
      </View>

      {list.isPending && <Loading />}
      {list.isError && (
        <View style={styles.pad}>
          <LoadError onRetry={() => void list.refetch()} />
        </View>
      )}
      {list.data && (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.number}
          renderItem={({ item }) => <OrderCard order={item} />}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={list.isRefetching && !list.isFetchingNextPage} onRefresh={() => void list.refetch()} tintColor={theme.primary} />}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={<EmptyState icon="inbox" title={s.orders.emptyTitle} body={s.orders.emptyBody} />}
          ListFooterComponent={
            list.hasNextPage ? (
              <Button label={s.orders.loadMore} variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />
            ) : undefined
          }
        />
      )}
    </View>
  );
}

/** One order: number and status, what needs attention, its items, the customer and the total. */
function OrderCard({ order: o }: { order: ShopOrderSummary }) {
  const theme = useTheme();
  const router = useRouter();
  const { s, locale } = useSellerI18n();
  const flags: { label: string; tone: 'sale' | 'primary' | 'muted' }[] = [];
  if (o.urgent) flags.push({ label: `⚡ ${s.orders.urgent}`, tone: 'sale' });
  if (o.pickup) flags.push({ label: s.orders.pickup, tone: 'primary' });
  if (o.billError) flags.push({ label: s.orders.replaceBill.badge, tone: 'sale' });
  if (o.depositStatus && s.orders.deposit.badge[o.depositStatus]) flags.push({ label: s.orders.deposit.badge[o.depositStatus], tone: 'sale' });

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/seller/orders/${encodeURIComponent(o.number)}`)}>
      {({ pressed }) => (
        <Card style={[styles.card, pressed && { opacity: 0.8 }]}>
          <View style={styles.row}>
            <ThemedText type="smallBold" style={styles.mono} numberOfLines={1}>
              {o.number}
            </ThemedText>
            <OrderStatusPill status={o.status} />
          </View>
          <ThemedText type="caption" themeColor="textSecondary">
            {o.status === 'PENDING' && o.paymentDueAt ? fill(s.orders.payBy, { date: dateTime(o.paymentDueAt, locale) }) : fill(s.orders.placed, { date: dateTime(o.createdAt, locale) })}
          </ThemedText>
          {flags.length > 0 && (
            <View style={styles.flags}>
              {flags.map((f) => (
                <Pill key={f.label} label={f.label} tone={f.tone} />
              ))}
            </View>
          )}
          {o.items.slice(0, 2).map((i) => (
            <View key={i.sku} style={styles.item}>
              <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                {i.imageUrl ? <Image source={i.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="package" size={18} color={theme.textSecondary} />}
              </View>
              <View style={styles.flex}>
                <ThemedText type="small" numberOfLines={1}>
                  {i.name}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                  {[i.variant, `× ${i.quantity}`].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
            </View>
          ))}
          <View style={[styles.row, styles.footer, { borderTopColor: theme.border }]}>
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
              {o.customer.name} · {fill(s.orders.items, { n: o.itemCount })}
            </ThemedText>
            <ThemedText type="smallBold" themeColor="primary">
              {money(o.total)}
            </ThemedText>
          </View>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  top: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.two },
  search: { justifyContent: 'center' },
  searchInput: { paddingLeft: 40 },
  searchIcon: { position: 'absolute', left: Spacing.three },
  tabs: { gap: Spacing.two, paddingVertical: Spacing.one },
  list: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  mono: { fontVariant: ['tabular-nums'], flexShrink: 1 },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  thumb: { width: 44, height: 44, borderRadius: Radius.sm + 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, marginTop: 2 },
});

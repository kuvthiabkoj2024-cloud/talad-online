import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Choices, KeyValue, SellerScroll, sellerStyles, StatTile, TileGrid } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { count, date, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

type Days = '7' | '30' | '90';
type Totals = { orders: number; revenue: number; customers: number; averageOrder: number; units: number };
interface ShopStats {
  days: number;
  series: { date: string; orders: number; revenue: number }[];
  totals: Totals;
  previous: Totals;
  payments: { method: string; orders: number; revenue: number }[];
  topProducts: { productId: string; name: string; imageUrl: string | null; units: number; revenue: number }[];
  statusCounts: Record<string, number>;
  productViews: number;
}

/** How the shop is selling (§3.8): totals against the period before, revenue per day, best sellers. */
export default function SellerStatsScreen() {
  const theme = useTheme();
  const { s, locale } = useSellerI18n();
  const st = s.stats;
  const [days, setDays] = useState<Days>('30');
  const stats = useQuery({ queryKey: ['seller', 'stats', days], queryFn: () => api<ShopStats>(`/me/shop/stats?days=${days}`) });
  const d = stats.data;

  /** "+12%" against the period before (green up, red down). */
  const change = (now: number, before: number) => {
    if (!before) return undefined;
    const p = Math.round(((now - before) / before) * 100);
    return { text: `${p >= 0 ? '+' : ''}${p}% · ${fill(st.vsPrevious, { n: days })}`, color: p >= 0 ? theme.primary : theme.sale };
  };
  const tile = (label: string, key: keyof Totals, format: (n: number) => string) => {
    const c = d ? change(d.totals[key], d.previous[key]) : undefined;
    return <StatTile key={key} label={label} value={d ? format(d.totals[key]) : '–'} hint={c?.text} hintColor={c?.color} />;
  };
  const best = d?.series.reduce((a, b) => (b.revenue > a.revenue ? b : a), d.series[0]);
  const max = Math.max(1, ...(d?.series.map((p) => p.revenue) ?? [1]));
  const paymentTotal = d?.payments.reduce((n, p) => n + p.revenue, 0) || 1;

  return (
    <>
      <Stack.Screen options={{ title: st.title }} />
      <SellerScroll loading={stats.isPending} error={stats.isError} refreshing={stats.isRefetching} onRefresh={() => void stats.refetch()}>
        <Choices value={days} onChange={setDays} options={(['7', '30', '90'] as const).map((k) => ({ key: k, label: fill(st.days, { n: k }) }))} />
        {d && (
          <>
            <TileGrid>
              {tile(st.revenue, 'revenue', money)}
              {tile(st.orders, 'orders', (n) => count(n, locale))}
              {tile(st.customers, 'customers', (n) => count(n, locale))}
              {tile(st.averageOrder, 'averageOrder', money)}
              {tile(st.units, 'units', (n) => count(n, locale))}
              <StatTile label={st.views} value={count(d.productViews, locale)} />
            </TileGrid>

            <Card style={sellerStyles.card}>
              <ThemedText type="smallBold">{st.dailyRevenue}</ThemedText>
              {d.totals.orders === 0 ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {st.noSales}
                </ThemedText>
              ) : (
                <>
                  <View style={styles.chart} accessibilityLabel={fill(st.chartLabel, { n: days })}>
                    {d.series.map((p) => (
                      <View key={p.date} style={styles.barSlot}>
                        <View style={[styles.bar, { height: `${Math.max(2, (p.revenue / max) * 100)}%`, backgroundColor: p === best ? theme.primary : theme.primarySoft }]} />
                      </View>
                    ))}
                  </View>
                  <View style={styles.axis}>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {date(d.series[0].date, locale)}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {date(d.series[d.series.length - 1].date, locale)}
                    </ThemedText>
                  </View>
                  {best && best.revenue > 0 && <KeyValue label={`${st.bestDay} · ${date(best.date, locale)}`} value={money(best.revenue)} strong />}
                </>
              )}
            </Card>

            {d.topProducts.length > 0 && (
              <Card style={sellerStyles.card}>
                <ThemedText type="smallBold">{st.topProducts}</ThemedText>
                {d.topProducts.map((p, i) => (
                  <View key={p.productId} style={styles.product}>
                    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rank}>
                      {i + 1}
                    </ThemedText>
                    <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                      {p.imageUrl ? <Image source={p.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="package" size={16} color={theme.textSecondary} />}
                    </View>
                    <View style={styles.flex}>
                      <ThemedText type="small" numberOfLines={1}>
                        {p.name}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {fill(st.sold, { n: count(p.units, locale) })}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold">{money(p.revenue)}</ThemedText>
                  </View>
                ))}
              </Card>
            )}

            {d.payments.length > 0 && (
              <Card style={sellerStyles.card}>
                <ThemedText type="smallBold">{st.byPayment}</ThemedText>
                {d.payments.map((p) => (
                  <KeyValue
                    key={p.method}
                    label={`${(s.orders.methods as Record<string, string>)[p.method] ?? p.method} · ${p.orders === 1 ? st.orderCount : fill(st.ordersCount, { n: p.orders })}`}
                    value={fill(st.ofRevenue, { p: Math.round((p.revenue / paymentTotal) * 100) })}
                  />
                ))}
              </Card>
            )}

            {Object.keys(d.statusCounts).length > 0 && (
              <Card style={sellerStyles.card}>
                <ThemedText type="smallBold">{st.byStatus}</ThemedText>
                {Object.entries(d.statusCounts).map(([status, n]) => (
                  <KeyValue key={status} label={(s.orders.status as Record<string, string>)[status] ?? status} value={count(n, locale)} />
                ))}
              </Card>
            )}
          </>
        )}
      </SellerScroll>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chart: { height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: 2 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  product: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  rank: { width: 18, textAlign: 'center' },
  thumb: { width: 40, height: 40, borderRadius: Radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});

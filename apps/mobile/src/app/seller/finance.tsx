import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PrivateImage } from '@/components/seller/private-image';
import { Choices, KeyValue, SellerScroll, sellerStyles, StatTile, TileGrid } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { date, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

type Period = 'this-month' | 'last-month' | 'last-90' | 'this-year';
interface ShopPayout {
  id: string;
  periodStart: string;
  periodEnd: string;
  net: number;
  status: 'SCHEDULED' | 'PROCESSING' | 'PAID' | 'FAILED';
  paidAt: string | null;
  reference: string | null;
  hasSlip: boolean;
}
interface ShopFinance {
  earned: { orders: number; gross: number; commission: number; net: number; discounts: { flashSale: number; shopCoupons: number; platformCoupons: number } };
  inProgress: { orders: number; amount: number };
  refunded: { orders: number; amount: number };
  pending: {
    count: number;
    amount: number;
    payouts: ShopPayout[];
    orders: { number: string; completedAt: string | null; net: number; readyAt: string | null; ready: boolean }[];
    ordersTotal: number;
  };
  payouts: ShopPayout[];
}

/** The period's start and end, as the Seller Center counts them. */
function range(p: Period): { from: Date; to: Date } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (p === 'last-month') return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
  if (p === 'last-90') return { from: new Date(now.getTime() - 90 * 86_400_000), to: now };
  if (p === 'this-year') return { from: new Date(y, 0, 1), to: now };
  return { from: new Date(y, m, 1), to: now };
}

/** Earnings, MC Mart's commission and payouts (§3.7). */
export default function SellerFinanceScreen() {
  const theme = useTheme();
  const { s, locale } = useSellerI18n();
  const f = s.finance;
  const [period, setPeriod] = useState<Period>('this-month');
  const [slip, setSlip] = useState<string | null>(null);
  const qs = useMemo(() => {
    const { from, to } = range(period);
    // Whole minutes, so the query key (and the cache) stays the same while the screen is open.
    return new URLSearchParams({
      from: new Date(Math.floor(from.getTime() / 60_000) * 60_000).toISOString(),
      to: new Date(Math.ceil(to.getTime() / 60_000) * 60_000).toISOString(),
    }).toString();
  }, [period]);
  const finance = useQuery({ queryKey: ['seller', 'finance', period], queryFn: () => api<ShopFinance>(`/me/shop/finance?${qs}`) });
  const d = finance.data;
  const status = f.payoutStatus as Record<string, string>;

  const payout = (p: ShopPayout) => (
    <View key={p.id} style={[styles.payout, { borderColor: theme.border }]}>
      <View style={styles.flex}>
        <ThemedText type="small">
          {date(p.periodStart, locale)} – {date(p.periodEnd, locale)}
        </ThemedText>
        <ThemedText type="caption" themeColor={p.status === 'FAILED' ? 'sale' : 'textSecondary'}>
          {status[p.status] ?? p.status}
          {p.paidAt ? ` · ${date(p.paidAt, locale)}` : ''}
          {p.reference ? ` · ${fill(f.reference, { ref: p.reference })}` : ''}
        </ThemedText>
        {p.hasSlip && (
          <ThemedText type="caption" themeColor="primary" onPress={() => setSlip(`/me/shop/finance/payouts/${p.id}/slip`)}>
            {f.viewSlip} ›
          </ThemedText>
        )}
      </View>
      <ThemedText type="smallBold">{money(p.net)}</ThemedText>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: f.title }} />
      <SellerScroll loading={finance.isPending} error={finance.isError} refreshing={finance.isRefetching} onRefresh={() => void finance.refetch()}>
        <Choices
          value={period}
          onChange={setPeriod}
          options={[
            { key: 'this-month', label: f.thisMonth },
            { key: 'last-month', label: f.lastMonth },
            { key: 'last-90', label: fill(s.stats.days, { n: 90 }) },
            { key: 'this-year', label: f.thisYear },
          ]}
        />
        {d && (
          <>
            <Card style={[sellerStyles.card, { backgroundColor: theme.primarySoft }]}>
              <ThemedText type="caption" themeColor="primary">
                {f.pending}
              </ThemedText>
              <ThemedText type="title" themeColor="primary">
                {money(d.pending.amount)}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {d.pending.count ? fill(f.pendingCount, { n: d.pending.count }) : f.noPending}
              </ThemedText>
            </Card>

            <Card style={sellerStyles.card}>
              <ThemedText type="smallBold">{f.earned}</ThemedText>
              <KeyValue label={f.gross} value={money(d.earned.gross)} />
              {d.earned.discounts.platformCoupons > 0 && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {fill(f.grossHint, { amount: money(d.earned.discounts.platformCoupons) })}
                </ThemedText>
              )}
              <KeyValue label={f.commission} value={`−${money(d.earned.commission)}`} muted />
              <KeyValue label={f.net} value={money(d.earned.net)} strong />
              <ThemedText type="caption" themeColor="textSecondary">
                {fill(f.orderCount, { n: d.earned.orders })}
              </ThemedText>
            </Card>

            <TileGrid>
              <StatTile label={f.inProgress} value={money(d.inProgress.amount)} hint={fill(f.inProgressHint, { n: d.inProgress.orders })} />
              <StatTile label={f.refunded} value={money(d.refunded.amount)} hint={fill(f.orderCount, { n: d.refunded.orders })} />
            </TileGrid>

            <Card style={sellerStyles.card}>
              <ThemedText type="smallBold">{f.discountsTitle}</ThemedText>
              <KeyValue label={f.flashSale} value={money(d.earned.discounts.flashSale)} />
              <KeyValue label={f.shopCoupons} value={money(d.earned.discounts.shopCoupons)} />
              <KeyValue label={f.platformCoupons} value={money(d.earned.discounts.platformCoupons)} />
            </Card>

            {(d.pending.payouts.length > 0 || d.pending.orders.length > 0) && (
              <Card style={sellerStyles.card}>
                <ThemedText type="smallBold">{f.pendingTitle}</ThemedText>
                {d.pending.payouts.map(payout)}
                {d.pending.orders.map((o) => (
                  <View key={o.number} style={[styles.payout, { borderColor: theme.border }]}>
                    <View style={styles.flex}>
                      <ThemedText type="small">{o.number}</ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {o.completedAt ? fill(f.completedOn, { date: date(o.completedAt, locale) }) : ''}
                        {' · '}
                        {o.ready ? f.orderReady : o.readyAt ? fill(f.orderWaitingUntil, { date: date(o.readyAt, locale) }) : f.orderWaiting}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold">{money(o.net)}</ThemedText>
                  </View>
                ))}
                {d.pending.ordersTotal > d.pending.orders.length && (
                  <ThemedText type="caption" themeColor="textSecondary">
                    {fill(f.pendingMore, { n: d.pending.ordersTotal - d.pending.orders.length })}
                  </ThemedText>
                )}
              </Card>
            )}

            <Card style={sellerStyles.card}>
              <ThemedText type="smallBold">{f.payouts}</ThemedText>
              {d.payouts.length ? (
                d.payouts.map(payout)
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {f.noPayouts}
                </ThemedText>
              )}
            </Card>
          </>
        )}
      </SellerScroll>
      <PrivateImage path={slip} onClose={() => setSlip(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  payout: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, borderRadius: Radius.sm },
});

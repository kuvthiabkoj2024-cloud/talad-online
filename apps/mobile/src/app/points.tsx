import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, LoadError, Loading } from '@/components/ui';
import { BrandGreen, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, type PointsView } from '@/lib/api';
import { date } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/** My points, as on the website: balance, when they expire, and the history (no money values or earning rules). */
export default function PointsScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const points = useInfiniteQuery({
    queryKey: ['me', 'points'],
    queryFn: ({ pageParam }) => api<PointsView>(`/me/points${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const p = points.data?.pages[0];
  const items = points.data?.pages.flatMap((pg) => pg.items) ?? [];

  return (
    <>
      <Stack.Screen options={{ title: t.acct.points }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={points.isRefetching} onRefresh={() => void points.refetch()} tintColor={theme.primary} />}>
        {points.isPending && <Loading />}
        {points.isError && <LoadError onRetry={() => void points.refetch()} />}
        {p && (
          <>
            <View style={styles.balance}>
              <ThemedText type="small" style={styles.soft}>
                {t.acct.pointsBalanceLabel}
              </ThemedText>
              <ThemedText style={styles.big}>{p.balance.toLocaleString('en-US')}</ThemedText>
              {p.owed > 0 && (
                <ThemedText type="small" style={styles.white}>
                  {fill(t.acct.pointsOwed, { n: p.owed.toLocaleString('en-US') })}
                </ThemedText>
              )}
            </View>

            {p.expiryDays && (
              <Card style={styles.card}>
                <ThemedText type="small">{fill(t.acct.pointsExpire, { days: p.expiryDays })}</ThemedText>
              </Card>
            )}

            <ThemedText type="subtitle">{t.acct.pointsHistory}</ThemedText>
            <Card>
              {items.length === 0 ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.pad}>
                  {t.acct.pointsEmpty}
                </ThemedText>
              ) : (
                items.map((e, i) => (
                  <View key={e.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold">{t.acct.pointsTypes[e.type]}</ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary">
                        {[e.orderNumber && fill(t.acct.pointsOrder, { n: e.orderNumber }), date(e.createdAt, locale), e.type === 'EARN' && e.expiresAt && fill(t.acct.pointsExpires, { date: date(e.expiresAt, locale) })]
                          .filter(Boolean)
                          .join(' · ')}
                      </ThemedText>
                    </View>
                    <ThemedText type="smallBold" style={{ color: e.points >= 0 ? BrandGreen : theme.sale }}>
                      {e.points > 0 ? '+' : ''}
                      {e.points.toLocaleString('en-US')}
                    </ThemedText>
                  </View>
                ))
              )}
            </Card>
            {points.hasNextPage && <Button label={t.acct.pointsMore} variant="outline" loading={points.isFetchingNextPage} onPress={() => void points.fetchNextPage()} />}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  balance: { backgroundColor: BrandGreen, borderRadius: 20, padding: Spacing.four, gap: Spacing.one },
  soft: { color: 'rgba(255,255,255,0.8)' },
  white: { color: '#ffffff' },
  big: { color: '#ffffff', fontSize: 40, lineHeight: 48, fontWeight: '800' },
  card: { padding: Spacing.three, gap: Spacing.two },
  pad: { padding: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
});

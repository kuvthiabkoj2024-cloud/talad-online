import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { NotificationRow, type NotificationItem } from '@/components/notification-row';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { clearBadge } from '@/lib/push-notifications';
import { sellerKeys } from '@/lib/seller';

interface InboxPage {
  items: NotificationItem[];
  unread: number;
  nextCursor: string | null;
}

/** The shop's notifications (the Seller Center's bell): new orders, payments, low stock, MC Mart news… */
export default function SellerNotificationsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const list = useInfiniteQuery({
    queryKey: ['seller', 'notifications'],
    queryFn: ({ pageParam }) => api<InboxPage>(`/me/shop/notifications${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unread ?? 0;

  useEffect(() => clearBadge(), []);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['seller', 'notifications'] });
    void queryClient.invalidateQueries({ queryKey: sellerKeys.badges });
    void queryClient.invalidateQueries({ queryKey: ['seller', 'inbox-unread'] });
  };
  /** Tapping marks it read (it doesn't open other screens). */
  function read(n: NotificationItem) {
    if (!n.readAt) void api(`/me/shop/notifications/${n.id}/read`, { method: 'POST' }).then(refresh).catch(() => {});
  }
  async function readAll() {
    await api('/me/shop/notifications/read-all', { method: 'POST' }).catch(() => {});
    refresh();
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t.notif.shopTitle,
          headerRight: () =>
            unread ? (
              <Pressable accessibilityRole="button" onPress={() => void readAll()} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="primary">
                  {t.notif.markAllRead}
                </ThemedText>
              </Pressable>
            ) : null,
        }}
      />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => void list.refetch()} tintColor={theme.primary} />}>
        {list.isPending && <Loading />}
        {list.isError && <LoadError onRetry={() => void list.refetch()} />}
        {list.data && !items.length && <EmptyState icon="bell" title={t.notif.empty} />}
        {items.length > 0 && (
          <Card style={styles.card}>
            {items.map((n, i) => (
              <NotificationRow key={n.id} item={n} divider={i > 0} onPress={() => read(n)} />
            ))}
          </Card>
        )}
        {list.hasNextPage && <Button label={t.notif.loadMore} variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { overflow: 'hidden' },
});

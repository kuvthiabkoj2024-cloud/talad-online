import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { NotificationRow, type NotificationItem } from '@/components/notification-row';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { clearBadge, routeFor } from '@/lib/push-notifications';

const TABS = ['all', 'orders', 'promotions', 'updates'] as const;
type Tab = (typeof TABS)[number];

interface Page {
  items: NotificationItem[];
  page: number;
  totalPages: number;
  unread: Record<Tab, number>;
}

/** The customer's notifications, as on the website: tabs, who each is from, tap to open. */
export default function NotificationsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('all');
  const list = useInfiniteQuery({
    queryKey: ['me', 'notifications', tab],
    queryFn: ({ pageParam }) => api<Page>(`/me/notifications?page=${pageParam}&pageSize=20${tab === 'all' ? '' : `&tab=${tab}`}`),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const unread = list.data?.pages[0]?.unread;

  // Opening the list clears the number on the app icon.
  useEffect(() => clearBadge(), []);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['me', 'notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['me', 'notifications-unread'] });
  };
  /**
   * Tapping marks it read and opens what it's about: the order, product, chat… or, for seller
   * news (`seller:` links), that Seller Center screen. Ones about nothing in particular stay here.
   */
  function read(n: NotificationItem) {
    if (!n.readAt) void api(`/me/notifications/${n.id}/read`, { method: 'POST' }).then(refresh).catch(() => {});
    const link = n.data?.link;
    if (!link) return;
    const to = routeFor({ link });
    if (to !== '/notifications' && to !== '/seller/notifications') router.push(to);
  }
  async function readAll() {
    await api(`/me/notifications/read-all${tab === 'all' ? '' : `?tab=${tab}`}`, { method: 'POST' }).catch(() => {});
    refresh();
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: t.notif.title,
          headerRight: () =>
            unread?.[tab] ? (
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
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((k) => (
            <Pill key={k} label={unread?.[k] ? `${t.notif.tabs[k]} (${unread[k]})` : t.notif.tabs[k]} selected={tab === k} onPress={() => setTab(k)} />
          ))}
        </ScrollView>
        {list.isPending && <Loading />}
        {list.isError && <LoadError onRetry={() => void list.refetch()} />}
        {list.data && !items.length && <EmptyState icon="bell" title={t.notif.empty} body={t.notif.emptyBody} />}
        {items.length > 0 && (
          <Card style={styles.card}>
            {items.map((n, i) => (
              <NotificationRow key={n.id} item={n} divider={i > 0} onPress={() => read(n)} />
            ))}
          </Card>
        )}
        {list.hasNextPage && (
          <View>
            <Button label={t.notif.loadMore} variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  tabs: { gap: Spacing.two },
  card: { overflow: 'hidden' },
});

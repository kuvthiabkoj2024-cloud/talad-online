import { type ProductStatus } from '@talad/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { useClearBadge } from '@/lib/seller';
import { Choices, SellerScroll, StatTile, TileGrid } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { CommentsSheet } from '@/components/video/comments-sheet';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { count, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

interface ShopVideo {
  productId: string;
  hidden: boolean;
  hiddenReason: string | null;
  name: string;
  status: ProductStatus;
  imageUrl: string | null;
  price: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
}
interface ShopVideoList {
  items: ShopVideo[];
  page: number;
  totalPages: number;
  totals: { views: number; likes: number; comments: number; shares: number };
}
interface NoVideoProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  price: number;
}

type Tab = 'with' | 'without';

/**
 * The shop's product videos (§2.5): how each one does, the customers' comments (answered as
 * the shop), and the products that still have no video.
 */
export default function SellerVideosScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { s, locale } = useSellerI18n();
  const v = s.videos;
  const [tab, setTab] = useState<Tab>('with');
  const [comments, setComments] = useState<ShopVideo | null>(null);
  useClearBadge('videos');

  const videos = useInfiniteQuery({
    queryKey: ['seller', 'videos'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<ShopVideoList>(`/me/shop/videos?page=${pageParam}&pageSize=20`),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const without = useInfiniteQuery({
    queryKey: ['seller', 'products-without-video'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => api<{ items: NoVideoProduct[]; page: number; totalPages: number }>(`/me/shop/products?video=without&page=${pageParam}&pageSize=20`),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    enabled: tab === 'without',
  });
  const list = tab === 'with' ? videos : without;
  const items = videos.data?.pages.flatMap((p) => p.items) ?? [];
  const missing = without.data?.pages.flatMap((p) => p.items) ?? [];
  const totals = videos.data?.pages[0]?.totals;

  const stat = (icon: IconName, n: number) => (
    <View style={styles.stat}>
      <Icon name={icon} size={13} color={theme.textSecondary} />
      <ThemedText type="caption" themeColor="textSecondary">
        {count(n, locale)}
      </ThemedText>
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: v.title }} />
      <SellerScroll loading={list.isPending} error={list.isError} refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
        {totals && (
          <TileGrid>
            <StatTile label={v.views} value={count(totals.views, locale)} />
            <StatTile label={v.likes} value={count(totals.likes, locale)} />
            <StatTile label={v.comments} value={count(totals.comments, locale)} />
            <StatTile label={v.shares} value={count(totals.shares, locale)} />
          </TileGrid>
        )}
        <Choices
          value={tab}
          onChange={setTab}
          options={[
            { key: 'with', label: v.withVideo },
            { key: 'without', label: v.withoutVideo },
          ]}
        />

        {tab === 'with' && videos.data && !items.length && <EmptyState icon="video" title={v.emptyTitle} body={v.emptyBody} />}
        {tab === 'with' &&
          items.map((it) => (
            <Card key={it.productId} style={styles.card}>
              <View style={styles.row}>
                <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                  {it.imageUrl && <Image source={it.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
                  <View style={styles.play}>
                    <Icon name="play" size={14} color="#ffffff" fill="#ffffff" />
                  </View>
                </View>
                <View style={styles.flex}>
                  <ThemedText type="small" numberOfLines={2}>
                    {it.name}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="primary">
                    {money(it.price)}
                  </ThemedText>
                  <View style={styles.stats}>
                    {stat('play', it.views)}
                    {stat('heart', it.likes)}
                    {stat('comment', it.comments)}
                    {stat('share', it.shares)}
                  </View>
                  {it.hidden && (
                    <ThemedText type="caption" themeColor="sale">
                      {v.hiddenBadge}
                      {it.hiddenReason ? `: ${it.hiddenReason}` : ''}
                    </ThemedText>
                  )}
                </View>
              </View>
              <View style={styles.row}>
                <Button label={fill(v.open, { name: '' }).trim()} icon="play" variant="outline" onPress={() => router.push(`/watch/product/${it.productId}`)} style={[styles.flex, styles.small]} />
                <Button label={`${v.comments} ${it.comments}`} icon="comment" variant="outline" onPress={() => setComments(it)} style={[styles.flex, styles.small]} />
              </View>
            </Card>
          ))}

        {tab === 'without' && without.data && !missing.length && <EmptyState icon="video" title={v.allHaveVideo} />}
        {tab === 'without' && missing.length > 0 && (
          <Card>
            {missing.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => router.push(`/seller/products/${p.id}`)}
                style={({ pressed }) => [styles.missing, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.thumbSmall, { backgroundColor: theme.backgroundElement }]}>
                  {p.imageUrl && <Image source={p.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
                <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                  {p.name}
                </ThemedText>
                <ThemedText type="caption" themeColor="primary" style={styles.bold}>
                  + {v.addVideo}
                </ThemedText>
              </Pressable>
            ))}
          </Card>
        )}
        {list.hasNextPage && <Button label={s.orders.loadMore} variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />}
      </SellerScroll>
      <CommentsSheet
        target={comments ? { kind: 'product', id: comments.productId } : null}
        total={comments?.comments ?? 0}
        asShop
        onClose={() => setComments(null)}
        onCount={() => void videos.refetch()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  card: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  thumb: { width: 72, height: 96, borderRadius: Radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  play: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, padding: 6 },
  stats: { flexDirection: 'row', gap: Spacing.three, marginTop: 4 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  small: { minHeight: 40 },
  missing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  thumbSmall: { width: 44, height: 44, borderRadius: Radius.sm, overflow: 'hidden' },
});

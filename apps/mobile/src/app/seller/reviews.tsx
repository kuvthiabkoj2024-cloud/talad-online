import { keepPreviousData, useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/seller/sheet';
import { Choices, SellerScroll, sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { date } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

type Filter = 'all' | 'unreplied' | '5' | '4' | '3' | '2' | '1';
interface ShopReview {
  id: string;
  rating: number;
  comment: string | null;
  mediaUrls: string[];
  reply: string | null;
  isHidden: boolean;
  createdAt: string;
  customer: { name: string };
  product: { id: string; name: string; imageUrl: string | null } | null;
}
interface ShopReviewList {
  items: ShopReview[];
  page: number;
  totalPages: number;
  summary: { average: number; count: number; unreplied: number };
}

/** What customers say (§3.5), and the shop's public replies. */
export default function SellerReviewsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { s, locale } = useSellerI18n();
  const r = s.reviews;
  const [filter, setFilter] = useState<Filter>('all');
  const [replying, setReplying] = useState<ShopReview | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const list = useInfiniteQuery({
    queryKey: ['seller', 'reviews', filter],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams({ page: String(pageParam), pageSize: '20' });
      if (filter === 'unreplied') q.set('unreplied', 'true');
      else if (filter !== 'all') q.set('rating', filter);
      return api<ShopReviewList>(`/me/shop/reviews?${q}`);
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const summary = list.data?.pages[0]?.summary;

  async function save(reply: string | null) {
    if (!replying) return;
    setSaving(true);
    try {
      await api(`/me/shop/reviews/${replying.id}/reply`, { method: 'PUT', body: { reply } });
      setReplying(null);
      void queryClient.invalidateQueries({ queryKey: ['seller', 'reviews'] });
      Alert.alert(r.saved);
    } catch {
      Alert.alert(s.common.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: r.title }} />
      <SellerScroll loading={list.isPending} error={list.isError} refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
        {summary && (
          <Card style={[sellerStyles.card, styles.summary]}>
            <ThemedText type="title" style={styles.average}>
              {summary.count ? summary.average.toFixed(1) : '–'}
            </ThemedText>
            <View style={styles.flex}>
              <Stars n={Math.round(summary.average)} />
              <ThemedText type="caption" themeColor="textSecondary">
                {fill(r.count, { n: summary.count })} · {r.unreplied}: {summary.unreplied}
              </ThemedText>
            </View>
          </Card>
        )}
        <Choices
          value={filter}
          onChange={setFilter}
          options={[
            { key: 'all', label: r.all },
            { key: 'unreplied', label: summary?.unreplied ? `${r.unreplied} ${summary.unreplied}` : r.unreplied },
            ...(['5', '4', '3', '2', '1'] as const).map((k) => ({ key: k, label: fill(r.stars, { n: k }) })),
          ]}
        />
        {list.data && !items.length && <EmptyState icon="star" title={r.emptyTitle} body={r.emptyBody} />}
        {items.map((rv) => (
          <Card key={rv.id} style={sellerStyles.card}>
            <View style={styles.head}>
              <Stars n={rv.rating} />
              <ThemedText type="caption" themeColor="textSecondary">
                {rv.customer.name} · {date(rv.createdAt, locale)}
              </ThemedText>
            </View>
            {rv.product ? (
              <View style={styles.product}>
                <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                  {rv.product.imageUrl && <Image source={rv.product.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
                </View>
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
                  {rv.product.name}
                </ThemedText>
              </View>
            ) : (
              <ThemedText type="caption" themeColor="textSecondary">
                {r.shopReview}
              </ThemedText>
            )}
            {rv.comment && <ThemedText type="small">{rv.comment}</ThemedText>}
            {rv.mediaUrls.length > 0 && (
              <View style={styles.media}>
                {rv.mediaUrls.map((u) => (
                  <Image key={u} source={u} style={[styles.photo, { backgroundColor: theme.backgroundElement }]} contentFit="cover" />
                ))}
              </View>
            )}
            {rv.isHidden && (
              <ThemedText type="caption" themeColor="sale">
                {r.hidden}
              </ThemedText>
            )}
            {rv.reply && (
              <View style={[styles.reply, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="caption" themeColor="textSecondary">
                  {r.yourReply}
                </ThemedText>
                <ThemedText type="small">{rv.reply}</ThemedText>
              </View>
            )}
            <Button
              label={rv.reply ? r.editReply : r.reply}
              variant="outline"
              icon="chat"
              onPress={() => {
                setText(rv.reply ?? '');
                setReplying(rv);
              }}
              style={styles.small}
            />
          </Card>
        ))}
        {list.hasNextPage && <Button label={s.orders.loadMore} variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />}
      </SellerScroll>

      <Sheet visible={!!replying} title={replying?.reply ? r.editReply : r.reply} onClose={() => setReplying(null)}>
        <Field label={r.yourReply}>
          <Input value={text} onChangeText={setText} placeholder={r.replyPlaceholder} multiline maxLength={1000} style={styles.multiline} />
        </Field>
        <Button label={s.common.save} loading={saving} disabled={!text.trim()} onPress={() => void save(text.trim())} />
        {replying?.reply && <Button label={r.deleteReply} variant="outline" onPress={() => void save(null)} />}
      </Sheet>
    </>
  );
}

function Stars({ n }: { n: number }) {
  const theme = useTheme();
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={14} color={theme.star} fill={i <= n ? theme.star : 'none'} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  average: { fontSize: 32, lineHeight: 40 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  stars: { flexDirection: 'row', gap: 2 },
  product: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  thumb: { width: 28, height: 28, borderRadius: 6, overflow: 'hidden' },
  media: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photo: { width: 72, height: 72, borderRadius: Radius.sm },
  reply: { borderRadius: Radius.md, padding: Spacing.two + 2, gap: 2 },
  small: { minHeight: 40, alignSelf: 'flex-start', paddingHorizontal: Spacing.three },
  multiline: { minHeight: 100, textAlignVertical: 'top', paddingTop: Spacing.two },
});

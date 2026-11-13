import { PRODUCT_STATUSES, type ProductStatus } from '@talad/shared';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { Choices, SellerScroll } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { count, priceRange } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

export interface ShopProductRow {
  id: string;
  name: string;
  sku: string;
  status: ProductStatus;
  rejectionReason: string | null;
  price: number;
  priceMax: number | null;
  stock: number;
  lowStock: boolean;
  imageUrl: string | null;
  hasVideo: boolean;
  variantCount: number;
  soldCount: number;
}
interface ShopProductList {
  items: ShopProductRow[];
  page: number;
  totalPages: number;
  counts: Record<ProductStatus | 'all', number>;
}

type Tab = ProductStatus | 'all';

/** The shop's products in every status (§3.3), with search; tap one to edit it. */
export default function SellerProductsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { s, locale } = useSellerI18n();
  const p = s.products;
  const [tab, setTab] = useState<Tab>('all');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(id);
  }, [typed]);

  const list = useInfiniteQuery({
    queryKey: ['seller', 'products', tab, q],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ page: String(pageParam), pageSize: '20' });
      if (tab !== 'all') query.set('status', tab);
      if (q) query.set('q', q);
      return api<ShopProductList>(`/me/shop/products?${query}`);
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.pages.flatMap((pg) => pg.items) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const statusTone: Record<ProductStatus, string> = { PUBLISHED: theme.primary, PENDING: '#d97706', DRAFT: theme.textSecondary, REJECTED: theme.sale };

  return (
    <>
      <Stack.Screen
        options={{
          title: p.title,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={p.add} onPress={() => router.push('/seller/products/new')} hitSlop={10}>
              <Icon name="add" size={26} color={theme.primary} />
            </Pressable>
          ),
        }}
      />
      <SellerScroll loading={list.isPending} error={list.isError} refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
        <Input value={typed} onChangeText={setTyped} placeholder={p.searchPlaceholder} autoCorrect={false} />
        <Choices
          value={tab}
          onChange={setTab}
          options={(['all', ...PRODUCT_STATUSES] as Tab[]).map((k) => ({
            key: k,
            label: `${k === 'all' ? p.all : s.productStatus[k]}${counts?.[k] ? ` ${counts[k]}` : ''}`,
          }))}
        />
        {list.data && !items.length && (
          <EmptyState
            icon="package"
            title={q ? p.noMatchTitle : p.emptyTitle}
            body={q ? p.noMatchBody : p.emptyBody}
            action={!q ? <Button label={p.add} icon="add" onPress={() => router.push('/seller/products/new')} style={styles.action} /> : undefined}
          />
        )}
        {items.length > 0 && (
          <Card>
            {items.map((it, i) => (
              <Pressable
                key={it.id}
                accessibilityRole="button"
                onPress={() => router.push(`/seller/products/${it.id}`)}
                style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                  {it.imageUrl ? <Image source={it.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="package" size={20} color={theme.textSecondary} />}
                  {it.hasVideo && (
                    <View style={styles.videoBadge}>
                      <Icon name="play" size={10} color="#ffffff" fill="#ffffff" />
                    </View>
                  )}
                </View>
                <View style={styles.flex}>
                  <ThemedText type="small" numberOfLines={2}>
                    {it.name}
                  </ThemedText>
                  <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                    {it.sku} · {p.sold} {count(it.soldCount, locale)}
                    {it.variantCount ? ` · ${it.variantCount} ${p.options}` : ''}
                  </ThemedText>
                  <View style={styles.meta}>
                    <ThemedText type="smallBold" themeColor="primary">
                      {priceRange(it.price, it.priceMax)}
                    </ThemedText>
                    <ThemedText type="caption" style={{ color: it.stock === 0 ? theme.sale : it.lowStock ? '#d97706' : theme.textSecondary }}>
                      {it.stock === 0 ? p.outOfStock : `${p.stock} ${it.stock}`}
                    </ThemedText>
                  </View>
                  {it.status === 'REJECTED' && it.rejectionReason && (
                    <ThemedText type="caption" themeColor="sale" numberOfLines={2}>
                      {fill(p.rejectedBecause, { reason: it.rejectionReason })}
                    </ThemedText>
                  )}
                </View>
                <ThemedText type="caption" style={{ color: statusTone[it.status], fontWeight: '700' }}>
                  {s.productStatus[it.status]}
                </ThemedText>
              </Pressable>
            ))}
          </Card>
        )}
        {list.hasNextPage && <Button label={s.orders.loadMore} variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />}
      </SellerScroll>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  action: { marginTop: Spacing.two, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  thumb: { width: 60, height: 60, borderRadius: Radius.sm + 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', right: 3, bottom: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: 2 },
});

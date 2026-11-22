import { PRODUCT_STATUSES, type ProductStatus } from '@talad/shared';
import { keepPreviousData, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { BrandField } from '@/components/seller/brand-field';
import { Sheet } from '@/components/seller/sheet';
import { Choices, SellerScroll } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, Pill } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
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
  /** The brand's name, or null. */
  brand?: string | null;
}
interface ShopProductList {
  items: ShopProductRow[];
  page: number;
  totalPages: number;
  counts: Record<ProductStatus | 'all', number>;
}

type Tab = ProductStatus | 'all';

/** Products picked for "Set brand" at once (the API's BULK_BRAND_MAX). */
const MAX_SELECTED = 100;

/**
 * The shop's products in every status (§3.3), with search; tap one to edit it. "Select" (or a
 * long press) ticks products, across filters like a playlist, to give them one brand at once.
 */
export default function SellerProductsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { s, locale } = useSellerI18n();
  const p = s.products;
  const [tab, setTab] = useState<Tab>('all');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [noBrand, setNoBrand] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [branding, setBranding] = useState(false);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(id);
  }, [typed]);

  const list = useInfiniteQuery({
    queryKey: ['seller', 'products', tab, q, noBrand],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const query = new URLSearchParams({ page: String(pageParam), pageSize: '20' });
      if (tab !== 'all') query.set('status', tab);
      if (q) query.set('q', q);
      if (noBrand) query.set('brand', 'none');
      return api<ShopProductList>(`/me/shop/products?${query}`);
    },
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
  const items = list.data?.pages.flatMap((pg) => pg.items) ?? [];
  const counts = list.data?.pages[0]?.counts;
  const pick = (ids: string[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (!on) next.delete(id);
        else if (next.size < MAX_SELECTED) next.add(id);
        else {
          Alert.alert(fill(p.maxSelected, { n: MAX_SELECTED }));
          break;
        }
      }
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setPicked(new Set());
  };
  const allPicked = items.length > 0 && items.every((it) => picked.has(it.id));
  const statusTone: Record<ProductStatus, string> = { PUBLISHED: theme.primary, PENDING: '#d97706', DRAFT: theme.textSecondary, REJECTED: theme.sale };

  return (
    <>
      <Stack.Screen
        options={{
          title: p.title,
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable accessibilityRole="button" onPress={() => (selecting ? stopSelecting() : setSelecting(true))} hitSlop={10}>
                <ThemedText type="smallBold" themeColor="primary">
                  {selecting ? p.cancelSelect : p.select}
                </ThemedText>
              </Pressable>
              {!selecting && (
                <Pressable accessibilityRole="button" accessibilityLabel={p.add} onPress={() => router.push('/seller/products/new')} hitSlop={10}>
                  <Icon name="add" size={26} color={theme.primary} />
                </Pressable>
              )}
            </View>
          ),
        }}
      />
      <SellerScroll contentStyle={picked.size ? { paddingBottom: 96 + insets.bottom } : undefined} loading={list.isPending} error={list.isError} refreshing={list.isRefetching} onRefresh={() => void list.refetch()}>
        <Input value={typed} onChangeText={setTyped} placeholder={p.searchPlaceholder} autoCorrect={false} />
        <View style={styles.filters}>
          {/* Products still without a brand, to give them one. */}
          <Pill label={p.noBrand} selected={noBrand} onPress={() => setNoBrand((v) => !v)} />
          {selecting && items.length > 0 && (
            <Pill label={allPicked ? p.cancelSelect : p.selectAll} onPress={() => pick(items.map((it) => it.id), !allPicked)} />
          )}
        </View>
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
                accessibilityState={selecting ? { checked: picked.has(it.id) } : undefined}
                onPress={() => (selecting ? pick([it.id], !picked.has(it.id)) : router.push(`/seller/products/${it.id}`))}
                onLongPress={() => {
                  setSelecting(true);
                  pick([it.id], true);
                }}
                style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                {selecting && (
                  <View style={[styles.tick, picked.has(it.id) ? { backgroundColor: theme.primary, borderColor: theme.primary } : { borderColor: theme.border }]}>
                    {picked.has(it.id) && <Icon name="check" size={14} color="#ffffff" />}
                  </View>
                )}
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
                  {!!it.brand && (
                    <View style={styles.brandTag}>
                      <Icon name="tag" size={11} color={theme.textSecondary} />
                      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                        {it.brand}
                      </ThemedText>
                    </View>
                  )}
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

      {picked.size > 0 && (
        <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
          <ThemedText type="smallBold" style={styles.flex}>
            {fill(p.selected, { n: picked.size })}
          </ThemedText>
          <Button label={p.setBrand} icon="tag" size="sm" onPress={() => setBranding(true)} />
        </View>
      )}
      <SetBrandSheet
        visible={branding}
        productIds={[...picked]}
        onClose={() => setBranding(false)}
        onDone={() => {
          setBranding(false);
          stopSelecting();
        }}
      />
    </>
  );
}

/** One brand for every ticked product: type or pick it; empty removes the brand. */
function SetBrandSheet({ visible, productIds, onClose, onDone }: { visible: boolean; productIds: string[]; onClose: () => void; onDone: () => void }) {
  const { s } = useSellerI18n();
  const p = s.products;
  const queryClient = useQueryClient();
  const [brand, setBrand] = useState('');
  const save = useMutation({
    mutationFn: () => api<{ updated: number; brand: string | null }>('/me/shop/products/brand', { method: 'POST', body: { productIds, brand: brand.trim() || null } }),
    onSuccess: (res) => {
      Alert.alert(fill(res.brand ? p.brandSaved : p.brandRemoved, { n: res.updated }));
      void queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
      setBrand('');
      onDone();
    },
    onError: (e) => Alert.alert(e instanceof ApiError ? e.message : s.common.saveError),
  });
  return (
    <Sheet visible={visible} title={fill(p.setBrandTitle, { n: productIds.length })} onClose={onClose}>
      <ThemedText type="small" themeColor="textSecondary">
        {p.setBrandBody}
      </ThemedText>
      <BrandField value={brand} placeholder={s.editor.brandPlaceholder} onChange={setBrand} autoFocus />
      <Button label={p.setBrand} icon="tag" loading={save.isPending} onPress={() => save.mutate()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  action: { marginTop: Spacing.two, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  thumb: { width: 60, height: 60, borderRadius: Radius.sm + 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  videoBadge: { position: 'absolute', right: 3, bottom: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, padding: 3 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  brandTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

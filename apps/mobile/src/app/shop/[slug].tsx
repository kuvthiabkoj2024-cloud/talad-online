import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Share, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ProductGrid } from '@/components/product-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { BrandGreen, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, SITE_URL, type ProductCard } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { count, date } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/** Mirrors the public shop profile (GET /shops/:slug), as the website's `PublicShop`. */
interface PublicShop {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  verified: boolean;
  productCount: number;
  ratingAvg: number;
  ratingCount: number;
  followerCount: number;
  joinedAt: string;
}

interface ShopProductPage {
  items: ProductCard[];
  page: number;
  total: number;
  hasMore: boolean;
}

const SORTS = ['popular', 'new', 'price_asc', 'price_desc'] as const;
type Sort = (typeof SORTS)[number];
const PAGE_SIZE = 12;

/** A shop's storefront (§3.2), as on the website: profile, follow, chat, in-shop search, sort and "Load more". */
export default function ShopScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const s = t.shop;
  const { customer } = useAuth();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('popular');
  const [expanded, setExpanded] = useState(false);
  const [opening, setOpening] = useState(false);

  const shop = useQuery({ queryKey: ['shop', slug], queryFn: () => api<PublicShop>(`/shops/${encodeURIComponent(slug)}`) });
  const products = useInfiniteQuery({
    queryKey: ['shop', slug, 'products', q, sort],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ sort, page: String(pageParam), pageSize: String(PAGE_SIZE) });
      if (q) params.set('q', q);
      return api<ShopProductPage>(`/shops/${encodeURIComponent(slug)}/products?${params}`);
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const data = shop.data;
  const own = !!data && customer?.shop?.id === data.id;
  const followKey = ['follow', 'shop', data?.id] as const;
  const following = useQuery({
    queryKey: followKey,
    enabled: !!customer && !!data && !own,
    queryFn: async () => (await api<{ shopIds: string[] }>(`/me/follows/status?ids=${data!.id}`)).shopIds.includes(data!.id),
  });

  async function toggleFollow() {
    if (!customer) return router.push('/login');
    if (!data) return;
    const on = !following.data;
    queryClient.setQueryData(followKey, on);
    queryClient.setQueryData<PublicShop>(['shop', slug], (old) => old && { ...old, followerCount: Math.max(0, old.followerCount + (on ? 1 : -1)) });
    try {
      await api(`/me/follows/${data.id}`, { method: on ? 'PUT' : 'DELETE' });
      void queryClient.invalidateQueries({ queryKey: ['me', 'follows'] });
    } catch {
      queryClient.setQueryData(followKey, !on);
      void shop.refetch();
    }
  }

  async function chat() {
    if (!customer) return router.push('/login');
    setOpening(true);
    try {
      const res = await api<{ id: string }>('/me/conversations', { method: 'POST', body: { shop: slug } });
      router.push({ pathname: '/messages/[id]', params: { id: res.id } });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      Alert.alert(code === 'OWN_SHOP' ? t.product.ownShopChat : code === 'SHOP_NOT_FOUND' ? t.product.shopUnavailable : t.common.error);
    } finally {
      setOpening(false);
    }
  }

  const share = () => data && void Share.share({ message: `${data.name} · MC Mart\n${SITE_URL}/${locale}/s/${data.slug}` });
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const total = products.data?.pages[0]?.total ?? 0;
  const sortLabel: Record<Sort, string> = { popular: s.sortPopular, new: s.sortNew, price_asc: s.sortPriceAsc, price_desc: s.sortPriceDesc };

  if (shop.isPending) return <Loading />;
  if (!data)
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        {shop.error instanceof ApiError && shop.error.status === 404 ? <EmptyState icon="shop" title={t.product.shopUnavailable} /> : <LoadError onRetry={() => void shop.refetch()} />}
      </View>
    );

  return (
    <>
      <Stack.Screen options={{ title: data.name }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={shop.isRefetching} onRefresh={() => void Promise.all([shop.refetch(), products.refetch()])} tintColor={theme.primary} />}>
        <Card style={styles.hero}>
          <View style={[styles.cover, { backgroundColor: BrandGreen }]}>{data.coverUrl && <Image source={data.coverUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}</View>
          <View style={styles.heroBody}>
            <View style={[styles.logo, { backgroundColor: theme.primarySoft, borderColor: theme.card }]}>
              {data.logoUrl ? <Image source={data.logoUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="shop" size={32} color={theme.primary} />}
            </View>
            <View style={styles.inline}>
              <ThemedText type="subtitle" numberOfLines={2} style={styles.shrink}>
                {data.name}
              </ThemedText>
              {data.verified && (
                <View style={[styles.verified, { backgroundColor: theme.primarySoft }]}>
                  <Icon name="verified" size={14} color={theme.primary} />
                  <ThemedText type="caption" themeColor="primary">
                    {s.verified}
                  </ThemedText>
                </View>
              )}
            </View>
            <View style={styles.meta}>
              <Meta icon="package" text={fill(s.productCount, { n: count(data.productCount, locale) })} />
              {data.ratingCount > 0 && <Meta icon="star" text={fill(s.rating, { rating: data.ratingAvg.toFixed(1), n: data.ratingCount })} />}
              <Meta icon="users" text={fill(s.followers, { n: count(data.followerCount, locale) })} />
              <Meta icon="clock" text={fill(s.joined, { date: date(data.joinedAt, locale) })} />
            </View>
            <View style={styles.actions}>
              {!own && (
                <>
                  <Button
                    label={following.data ? s.following : s.follow}
                    icon={following.data ? undefined : 'add'}
                    variant={following.data ? 'outline' : 'primary'}
                    onPress={() => void toggleFollow()}
                    style={[styles.flex, styles.small]}
                  />
                  <Button label={s.chat} icon="chat" variant="outline" loading={opening} onPress={() => void chat()} style={[styles.flex, styles.small]} />
                </>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={s.share} onPress={share} style={[styles.shareBtn, { borderColor: theme.primary }]}>
                <Icon name="share" size={18} color={theme.primary} />
              </Pressable>
            </View>
            {!!data.description && (
              <View style={[styles.about, { borderTopColor: theme.border }]}>
                <ThemedText type="smallBold">{s.about}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={expanded ? undefined : 4}>
                  {data.description}
                </ThemedText>
                {data.description.length > 180 && (
                  <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6}>
                    <ThemedText type="smallBold" themeColor="primary">
                      {expanded ? s.readLess : s.readMore}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </Card>

        <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Icon name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => setQ(text.trim().slice(0, 100))}
            placeholder={s.searchPlaceholder}
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            style={[styles.input, { color: theme.text }]}
          />
          {!!(text || q) && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={s.clearSearch}
              hitSlop={8}
              onPress={() => {
                setText('');
                setQ('');
              }}>
              <Icon name="close" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SORTS.map((key) => (
            <Pill key={key} label={sortLabel[key]} selected={sort === key} onPress={() => setSort(key)} />
          ))}
        </ScrollView>

        {products.isPending && <Loading />}
        {products.isError && <LoadError onRetry={() => void products.refetch()} />}
        {products.data &&
          (items.length ? (
            <>
              <ThemedText type="caption" themeColor="textSecondary">
                {q ? `${total} · "${q}"` : `${s.allProducts} (${total})`}
              </ThemedText>
              <ProductGrid products={items} />
              {products.hasNextPage && <Button label={s.loadMore} variant="outline" loading={products.isFetchingNextPage} onPress={() => void products.fetchNextPage()} />}
            </>
          ) : q ? (
            <EmptyState icon="search" title={s.noResults} body={s.noResultsBody} />
          ) : (
            <EmptyState icon="package" title={s.noProducts} />
          ))}
      </ScrollView>
    </>
  );
}

function Meta({ icon, text }: { icon: 'package' | 'star' | 'users' | 'clock'; text: string }) {
  const theme = useTheme();
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size={14} color={icon === 'star' ? '#f59e0b' : theme.textSecondary} />
      <ThemedText type="caption" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  hero: { overflow: 'hidden', padding: 0 },
  cover: { height: 120 },
  heroBody: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: Spacing.two },
  logo: { width: 80, height: 80, marginTop: -40, borderRadius: Radius.lg, borderWidth: 4, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: Radius.full, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three, rowGap: Spacing.one },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center', marginTop: Spacing.one },
  small: { minHeight: 42 },
  shareBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  about: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, marginTop: Spacing.one, gap: 4 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.three, minHeight: 46 },
  input: { flex: 1, fontFamily: FontFamily.regular, fontSize: 15, paddingVertical: Spacing.two },
  chips: { gap: Spacing.two },
});

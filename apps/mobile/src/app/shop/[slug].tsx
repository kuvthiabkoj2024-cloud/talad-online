import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { shopOpenState, WEEKDAY_NAMES, WEEKDAYS, type BusinessHours } from '@talad/shared';
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
  /** Opening hours per weekday (days left out are closed); empty when not set. */
  businessHours?: BusinessHours | null;
}

interface BrandItem {
  slug: string;
  name: string;
  productCount: number;
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

/**
 * A shop's storefront (§3.2), as on the website: profile, follow, chat, more about the shop
 * (folded), in-shop search with the sort in a dropdown beside it, brand chips and "Load more".
 */
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
  const [brand, setBrand] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [opening, setOpening] = useState(false);

  const shop = useQuery({ queryKey: ['shop', slug], queryFn: () => api<PublicShop>(`/shops/${encodeURIComponent(slug)}`) });
  const products = useInfiniteQuery({
    queryKey: ['shop', slug, 'products', q, sort, brand],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ sort, page: String(pageParam), pageSize: String(PAGE_SIZE) });
      if (q) params.set('q', q);
      if (brand) params.set('brand', brand);
      return api<ShopProductPage>(`/shops/${encodeURIComponent(slug)}/products?${params}`);
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });

  const brands = useQuery({ queryKey: ['shop', slug, 'brands'], queryFn: () => api<BrandItem[]>(`/brands?shop=${encodeURIComponent(slug)}`) });

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
                    size="sm"
                    style={styles.flex}
                  />
                  <Button label={s.chat} icon="chat" variant="outline" size="sm" loading={opening} onPress={() => void chat()} style={styles.flex} />
                </>
              )}
              <Pressable accessibilityRole="button" accessibilityLabel={s.share} onPress={share} style={[styles.shareBtn, { borderColor: theme.primary }]}>
                <Icon name="share" size={16} color={theme.primary} />
              </Pressable>
            </View>
          </View>
          {/* More about the shop, folded away until tapped (as on the website). */}
          {!!data.description && (
            <Section icon="info" title={s.about}>
              <ThemedText type="small" themeColor="textSecondary">
                {data.description}
              </ThemedText>
            </Section>
          )}
          {data.businessHours && <Hours hours={data.businessHours} />}
        </Card>

        {/* Search and the sort dropdown side by side; brand chips below. */}
        <View style={styles.searchRow}>
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={s.sortLabel}
            accessibilityState={{ expanded: sortOpen }}
            onPress={() => setSortOpen((v) => !v)}
            style={[styles.filterBtn, { backgroundColor: theme.card, borderColor: sortOpen ? theme.primary : theme.border }]}>
            <Icon name="sliders" size={20} color={sortOpen ? theme.primary : theme.text} />
            {sort !== 'popular' && <View style={[styles.dot, { backgroundColor: theme.primary, borderColor: theme.card }]} />}
          </Pressable>
          {sortOpen && (
            <View style={[styles.menu, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.menuTitle}>
                {s.sortLabel}
              </ThemedText>
              {SORTS.map((key) => {
                const active = sort === key;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setSort(key);
                      setSortOpen(false);
                    }}
                    style={[styles.menuItem, active && { backgroundColor: theme.primarySoft }]}>
                    <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'primary' : 'text'} style={styles.flex}>
                      {sortLabel[key]}
                    </ThemedText>
                    {active && <Icon name="check" size={16} color={theme.primary} />}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
        {!!brands.data?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[{ slug: null, name: s.allBrands }, ...brands.data].map((b) => (
              <Pill key={b.slug ?? 'all'} label={b.name} selected={brand === b.slug} onPress={() => setBrand(b.slug)} />
            ))}
          </ScrollView>
        )}

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

/** A folded part of the shop card (about, opening hours): tap the title row to open it. */
function Section({ icon, title, summary, children }: { icon: 'info' | 'clock'; title: string; summary?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.section, { borderTopColor: theme.border }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={styles.sectionHead}>
        <Icon name={icon} size={16} color={theme.textSecondary} />
        <ThemedText type="smallBold">{title}</ThemedText>
        <View style={styles.flex}>{summary}</View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={18} color={theme.textSecondary} />
        </View>
      </Pressable>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

/** Opening hours, with "· Open now" on the folded row (Vientiane time, rechecked each minute). */
function Hours({ hours }: { hours: BusinessHours }) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const s = t.shop;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const state = shopOpenState(hours, new Date(now));
  if (!state) return null;
  const names = WEEKDAY_NAMES[locale === 'lo' ? 'lo' : 'en'];
  const detail =
    state.open && state.today
      ? fill(s.closesAt, { time: state.today.close })
      : state.next && (state.next.today ? fill(s.opensToday, { time: state.next.open }) : fill(s.opensOn, { day: names[state.next.day], time: state.next.open }));
  const summary = (
    <ThemedText type="small" numberOfLines={1}>
      <ThemedText type="smallBold" style={{ color: state.open ? theme.primary : '#dc2626' }}>
        · {state.open ? s.openNow : s.closedNow}
      </ThemedText>
    </ThemedText>
  );
  return (
    <Section icon="clock" title={s.hours} summary={summary}>
      {!!detail && (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      )}
      {WEEKDAYS.map((d) => (
        <View key={d} style={styles.hoursRow}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.hoursDay}>
            {names[d]}
          </ThemedText>
          <ThemedText type="small" themeColor={hours[d] ? 'text' : 'textSecondary'}>
            {hours[d] ? `${hours[d].open}–${hours[d].close}` : s.closedDay}
          </ThemedText>
        </View>
      ))}
    </Section>
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
  shareBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  section: { borderTopWidth: StyleSheet.hairlineWidth },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: 12 },
  sectionBody: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, gap: 4 },
  hoursRow: { flexDirection: 'row' },
  hoursDay: { width: 110 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, zIndex: 10 },
  filterBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 9, right: 9, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  menu: {
    position: 'absolute',
    top: 52,
    right: 0,
    width: 230,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 6,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  menuTitle: { paddingHorizontal: Spacing.two, paddingTop: 4, paddingBottom: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Radius.md, paddingHorizontal: Spacing.two, paddingVertical: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.three, minHeight: 46 },
  input: { flex: 1, fontFamily: FontFamily.regular, fontSize: 15, paddingVertical: Spacing.two },
  chips: { gap: Spacing.two },
});

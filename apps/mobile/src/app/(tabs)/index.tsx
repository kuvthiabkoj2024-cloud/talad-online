import { useQueries } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue, withTiming } from 'react-native-reanimated';

import { AppHeader } from '@/components/app-header';
import { HeroCarousel } from '@/components/hero-carousel';
import { Icon } from '@/components/icon';
import { ProductCard, ProductGrid } from '@/components/product-card';
import { ThemedText } from '@/components/themed-text';
import { LoadError, Loading, SectionTitle } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, localized, SHOP_URL, type CategoryNode, type LocalizedText, type ProductCard as Product } from '@/lib/api';
import { categoryIcon } from '@/lib/category-icons';
import { useI18n } from '@/lib/i18n';

/** Each category gets its own colour (icon on a soft tint of it), so the row reads at a glance. */
const TINTS = ['#2e7d32', '#1e88e5', '#f57c00', '#d81b60', '#8e24aa', '#00897b', '#f9a825', '#6d4c41'];

/** Home, as the website on a phone: banner, categories, the flash sale, selling on MC Mart, then products. */
export default function HomeScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const [categories, banners, sale, popular, fresh] = useQueries({
    queries: [
      { queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories') },
      { queryKey: ['banners'], queryFn: () => api<{ id: string; title: LocalizedText; imageUrl: string }[]>('/banners') },
      { queryKey: ['flash-sale'], queryFn: () => api<{ endsAt: string | null; items: Product[] }>('/products/flash-sale') },
      { queryKey: ['products', 'popular'], queryFn: () => api<Product[]>('/products?sort=popular&limit=12') },
      { queryKey: ['products', 'new'], queryFn: () => api<Product[]>('/products?sort=new&limit=12') },
    ],
  });
  const all = [categories, banners, sale, popular, fresh];

  // Scrolling down folds the search bar away; any scroll up (or reaching the top) brings it back.
  const searchShown = useSharedValue(1);
  // Where the bar is heading (1 shown, 0 hidden), so a change of direction mid-animation takes effect.
  const heading = useSharedValue(1);
  const lastY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y;
    const dy = y - lastY.get();
    lastY.set(y);
    const target = y <= 8 ? 1 : dy > 4 ? 0 : dy < -4 ? 1 : null;
    if (target !== null && target !== heading.get()) {
      heading.set(target);
      searchShown.set(withTiming(target, { duration: 220 }));
    }
  });
  const refreshing = all.some((q) => q.isRefetching);
  const refresh = () => all.forEach((q) => void q.refetch());

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <AppHeader searchShown={searchShown} />
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}>
        <HeroCarousel slides={t.home.slides} banners={(banners.data ?? []).map((b) => ({ id: b.id, title: localized(b.title, locale), imageUrl: b.imageUrl }))} />

        {categories.data && categories.data.length > 0 && <CategoryStrip categories={categories.data} />}

        {sale.data && sale.data.items.length > 0 && (
          <LinearGradient colors={['#ef4444', '#f97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.sale}>
            <View style={styles.saleHead}>
              <View style={styles.saleTitle}>
                <Icon name="flash" size={22} color="#ffffff" fill="#ffffff" />
                <ThemedText type="subtitle" style={styles.white}>
                  {t.home.flashSale}
                </ThemedText>
              </View>
              {sale.data.endsAt && <Countdown endsAt={sale.data.endsAt} />}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.saleRow}>
              {sale.data.items.map((p) => (
                <ProductCard key={p.id} product={p} width={148} />
              ))}
            </ScrollView>
          </LinearGradient>
        )}

        <SellerBanner />

        {popular.isPending && <Loading />}
        {popular.isError && fresh.isError && <LoadError onRetry={refresh} />}
        {popular.data && popular.data.length > 0 && (
          <View style={styles.section}>
            <SectionTitle title={t.home.recommended} />
            <ProductGrid products={popular.data} />
          </View>
        )}
        {fresh.data && fresh.data.length > 0 && (
          <View style={styles.section}>
            <SectionTitle title={t.home.newArrivals} />
            <ProductGrid products={fresh.data} />
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

/** Round category icons, each in its own colour, in a row that scrolls sideways. */
function CategoryStrip({ categories }: { categories: CategoryNode[] }) {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  return (
    <View style={styles.section}>
      <SectionTitle
        title={t.home.categories}
        right={
          <Pressable accessibilityRole="link" onPress={() => router.push('/categories')} hitSlop={8} style={styles.seeAll}>
            <ThemedText type="link">{t.seeAll}</ThemedText>
            <Icon name="chevron-right" size={16} color={theme.primary} />
          </Pressable>
        }
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {categories.map((c, i) => {
          const tint = TINTS[i % TINTS.length];
          return (
            <Pressable key={c.id} onPress={() => router.push(`/category/${c.slug}`)} style={({ pressed }) => [styles.cat, pressed && styles.pressed]}>
              <View style={[styles.catIcon, { backgroundColor: `${tint}1f` }]}>
                {c.iconUrl ? (
                  <Image source={c.iconUrl} style={styles.catImage} contentFit="contain" tintColor={tint} />
                ) : (
                  <Icon name={categoryIcon(c.slug)} size={26} color={tint} />
                )}
              </View>
              <ThemedText type="caption" numberOfLines={2} style={styles.catName}>
                {localized(c.name, locale)}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** "Start your business with MC Mart", as on the website: opens the Seller Center sign-up. */
function SellerBanner() {
  const { t } = useI18n();
  return (
    <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(`${SHOP_URL}/register`)}>
      {({ pressed }) => (
        <LinearGradient colors={['#14471a', '#2e7d32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.seller, pressed && styles.pressed]}>
          <View style={styles.sellerIcon}>
            <Icon name="shop" size={24} color="#ffffff" />
          </View>
          <ThemedText type="smallBold" style={[styles.white, styles.flex]}>
            {t.home.sellerTitle}{' '}
            <ThemedText type="smallBold" style={styles.lime}>
              {t.brand}
            </ThemedText>
          </ThemedText>
          <View style={styles.sellerCta}>
            <ThemedText type="caption" style={styles.ctaText}>
              {t.home.sellerCta}
            </ThemedText>
          </View>
        </LinearGradient>
      )}
    </Pressable>
  );
}

/** "Ends in 02 : 14 : 09", ticking every second. */
function Countdown({ endsAt }: { endsAt: string }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const left = Math.max(0, new Date(endsAt).getTime() - now);
  const parts = [3_600_000, 60_000, 1000].map((unit, i) => String(Math.floor(left / unit) % (i === 0 ? 1000 : 60)).padStart(2, '0'));
  return (
    <View style={styles.countdown}>
      <ThemedText type="caption" style={styles.white}>
        {t.home.endsIn}
      </ThemedText>
      {parts.map((p, i) => (
        <View key={i} style={styles.clock}>
          <ThemedText type="caption" style={styles.clockText}>
            {p}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  white: { color: '#ffffff' },
  lime: { color: '#c5e1a5' },
  content: { padding: Spacing.three, paddingBottom: Spacing.five, gap: Spacing.four },
  section: { gap: Spacing.three },
  seeAll: { flexDirection: 'row', alignItems: 'center' },
  catRow: { gap: Spacing.two + 2, paddingRight: Spacing.three },
  cat: { width: 74, alignItems: 'center', gap: Spacing.one + 2 },
  catIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  catImage: { width: 30, height: 30 },
  catName: { textAlign: 'center' },
  pressed: { opacity: 0.75 },
  sale: { borderRadius: Radius.lg + 4, paddingVertical: Spacing.three, gap: Spacing.three },
  saleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.three, gap: Spacing.two },
  saleTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  saleRow: { gap: Spacing.two + 2, paddingHorizontal: Spacing.three },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  clock: { backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: 6, paddingHorizontal: 6 },
  clockText: { color: '#ffffff', fontWeight: '800', fontVariant: ['tabular-nums'] },
  seller: { borderRadius: Radius.lg + 4, padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  sellerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  sellerCta: { backgroundColor: '#ffffff', borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: 6 },
  ctaText: { color: '#2e7d32', fontWeight: '800' },
});

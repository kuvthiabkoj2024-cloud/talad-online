import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ProductGrid } from '@/components/product-card';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, localized, type CategoryNode, type ProductCard } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** One category's products (best sellers first), with its sub-categories and then its brands as chips (category → brand). */
export default function CategoryScreen() {
  const { slug, brand } = useLocalSearchParams<{ slug: string; brand?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { t, locale } = useI18n();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories') });
  const products = useQuery({
    queryKey: ['products', 'category', slug, brand ?? null],
    queryFn: () => api<ProductCard[]>(`/products?${new URLSearchParams({ category: slug, sort: 'popular', limit: '40', ...(brand && { brand }) })}`),
  });
  const brands = useQuery({
    queryKey: ['brands', 'category', slug],
    queryFn: () => api<{ slug: string; name: string; productCount: number }[]>(`/brands?category=${encodeURIComponent(slug)}`),
  });

  const top = categories.data?.find((c) => c.slug === slug || c.children.some((ch) => ch.slug === slug));
  const current = top?.slug === slug ? top : top?.children.find((ch) => ch.slug === slug);

  return (
    <>
      <Stack.Screen options={{ title: current ? localized(current.name, locale) : '' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={products.isRefetching} onRefresh={() => void products.refetch()} tintColor={theme.primary} />}>
        {top && top.children.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pill label={t.categories.all} selected={slug === top.slug} onPress={() => router.setParams({ slug: top.slug })} />
            {top.children.map((ch) => (
              <Pill key={ch.id} label={localized(ch.name, locale)} selected={slug === ch.slug} onPress={() => router.setParams({ slug: ch.slug, brand: undefined })} />
            ))}
          </ScrollView>
        )}
        {!!brands.data?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.brandLabel}>
              {t.categories.brand}:
            </ThemedText>
            <Pill label={t.categories.allBrands} tone="primary" selected={!brand} onPress={() => router.setParams({ brand: undefined })} />
            {brands.data.map((b) => (
              <Pill key={b.slug} label={b.name} tone="primary" selected={brand === b.slug} onPress={() => router.setParams({ brand: b.slug })} />
            ))}
          </ScrollView>
        )}
        {products.isPending && <Loading />}
        {products.isError && <LoadError onRetry={() => void products.refetch()} />}
        {products.data &&
          (products.data.length ? (
            <View>
              <ProductGrid products={products.data} />
            </View>
          ) : (
            <EmptyState icon="package" title={t.categories.empty} />
          ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  chips: { gap: Spacing.two, alignItems: 'center' },
  brandLabel: { marginRight: Spacing.one },
});

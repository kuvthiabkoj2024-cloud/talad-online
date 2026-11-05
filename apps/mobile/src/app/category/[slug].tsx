import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ProductGrid } from '@/components/product-card';
import { EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, localized, type CategoryNode, type ProductCard } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** One category's products (best sellers first), with its sub-categories as chips. */
export default function CategoryScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { t, locale } = useI18n();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories') });
  const products = useQuery({
    queryKey: ['products', 'category', slug],
    queryFn: () => api<ProductCard[]>(`/products?${new URLSearchParams({ category: slug, sort: 'popular', limit: '40' })}`),
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
              <Pill key={ch.id} label={localized(ch.name, locale)} selected={slug === ch.slug} onPress={() => router.setParams({ slug: ch.slug })} />
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
  chips: { gap: Spacing.two },
});

import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { productHref, type ProductCard as Product } from '@/lib/api';
import { count, money, priceRange } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/** Same card as the website: square photo, discount badge, name, shop, price, rating and sold. */
export function ProductCard({ product, width }: { product: Product; width?: number }) {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  // A discount badge only makes sense for a single price.
  const discount =
    !product.priceMax && product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(productHref(product))}
      style={({ pressed }) => [styles.card, { backgroundColor: theme.card, borderColor: theme.border, width }, pressed && styles.pressed]}>
        <View style={[styles.photo, { backgroundColor: theme.backgroundElement }]}>
          {product.imageUrl ? (
            <Image source={product.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Icon name="package" size={48} color={theme.border} strokeWidth={1.25} />
          )}
          {discount > 0 && (
            <View style={[styles.badge, { backgroundColor: theme.sale }]}>
              <ThemedText type="caption" style={styles.badgeText}>
                -{discount}%
              </ThemedText>
            </View>
          )}
        </View>
        <View style={styles.body}>
          <ThemedText type="small" numberOfLines={2} style={styles.name}>
            {product.name}
          </ThemedText>
          <View style={styles.shopRow}>
            <Icon name="shop" size={13} color={theme.textSecondary} />
            <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
              {product.shop.name}
            </ThemedText>
          </View>
          <View style={styles.priceRow}>
            <ThemedText type="smallBold" themeColor="primary" style={styles.price}>
              {priceRange(product.price, product.priceMax)}
            </ThemedText>
            {discount > 0 && (
              <ThemedText type="caption" themeColor="textSecondary" style={styles.strike}>
                {money(product.compareAtPrice!)}
              </ThemedText>
            )}
          </View>
          {(product.ratingAvg > 0 || product.soldCount > 0) && (
            <View style={styles.metaRow}>
              {product.ratingAvg > 0 && (
                <View style={styles.rating}>
                  <Icon name="star" size={12} color={theme.star} fill={theme.star} />
                  <ThemedText type="caption" themeColor="textSecondary">
                    {product.ratingAvg.toFixed(1)}
                  </ThemedText>
                </View>
              )}
              {product.soldCount > 0 && (
                <ThemedText type="caption" themeColor="textSecondary" style={styles.sold}>
                  {fill(t.product.sold, { n: count(product.soldCount, locale) })}
                </ThemedText>
              )}
            </View>
          )}
        </View>
    </Pressable>
  );
}

/** Two columns, like the website on phones. */
export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <View style={styles.grid}>
      {products.map((p) => (
        <View key={p.id} style={styles.cell}>
          <ProductCard product={p} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#0f172a',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pressed: { opacity: 0.85 },
  photo: { aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: Radius.lg, borderTopRightRadius: Radius.lg, overflow: 'hidden' },
  badge: { position: 'absolute', top: Spacing.two, left: Spacing.two, borderRadius: Radius.full, paddingHorizontal: Spacing.two },
  badgeText: { color: '#ffffff', fontWeight: '700' },
  body: { padding: Spacing.two + 2, gap: Spacing.one, flex: 1 },
  name: { minHeight: 40 },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  flex: { flex: 1 },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: Spacing.one, marginTop: 'auto' },
  price: { fontSize: 16 },
  strike: { textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sold: { marginLeft: 'auto' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.one - 2 },
  cell: { width: '50%', padding: Spacing.one + 2, flexDirection: 'row' },
});

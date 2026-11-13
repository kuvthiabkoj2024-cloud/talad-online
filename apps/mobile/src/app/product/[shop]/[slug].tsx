import { Icon } from '@/components/icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { ProductGrid } from '@/components/product-card';
import { Button, Card, EmptyState, LoadError, Loading, Pill, SectionTitle } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useCartActions } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import type { Locale } from '@talad/shared';

import { api, ApiError, type ProductCard as ProductCardData, type ProductDetail } from '@/lib/api';
import { bulkPrice, bulkRows } from '@/lib/bulk-price';
import { useAuth } from '@/lib/auth';
import { count, money, priceRange } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/** Product page, as on the website: gallery, price, shop, options, quantity and buying. */
export default function ProductScreen() {
  const { shop, slug } = useLocalSearchParams<{ shop: string; slug: string }>();
  const theme = useTheme();
  const { t, locale } = useI18n();
  const product = useQuery({
    queryKey: ['product', shop, slug],
    queryFn: () => api<ProductDetail>(`/products/${encodeURIComponent(shop)}/${encodeURIComponent(slug)}`),
  });

  return (
    <>
      <Stack.Screen options={{ title: product.data?.name ?? '' }} />
      {product.isPending && <Loading />}
      {product.isError &&
        (product.error instanceof ApiError && product.error.status === 404 ? (
          <View style={styles.pad}>
            <EmptyState icon="package" title={t.product.notFound} />
          </View>
        ) : (
          <View style={styles.pad}>
            <LoadError onRetry={() => void product.refetch()} />
          </View>
        ))}
      {product.data && <Product product={product.data} themeBg={theme.background} locale={locale} />}
    </>
  );
}

function Product({ product, themeBg, locale }: { product: ProductDetail; themeBg: string; locale: Locale }) {
  const theme = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { customer } = useAuth();
  const { add } = useCartActions();
  const [picked, setPicked] = useState<Record<string, string>>(() =>
    // A single variant (or options with one value each) needs no choosing.
    Object.fromEntries(product.options.filter((o) => o.values.length === 1).map((o) => [o.name, o.values[0]])),
  );
  const [quantity, setQuantity] = useState(1);

  const variant = product.variants.length
    ? product.variants.find((v) => product.options.every((o) => v.attributes[o.name] === picked[o.name])) ?? null
    : null;
  const missing = product.options.find((o) => !picked[o.name]);
  // Bulk prices: the price per unit follows the quantity once the option (if any) is known.
  const bulk = product.bulkPricing ?? null;
  const flashPercent = product.flashSale?.percent ?? null;
  const regular = variant ? (variant.regularPrice ?? variant.price) : !product.variants.length && bulk ? bulk.basePrice : null;
  const onePrice = variant ? variant.price : product.price;
  const price = bulk && regular !== null ? bulkPrice(bulk, regular, quantity, flashPercent) : onePrice;
  const priceMax = variant || (bulk && regular !== null) ? null : product.priceMax;
  const compareAt = price < onePrice ? Math.max(onePrice, variant?.regularPrice ?? product.compareAtPrice ?? 0) : variant ? variant.regularPrice : product.compareAtPrice;
  // Without a chosen option, the table shows the cheapest option's prices.
  const tableRegular = regular ?? (bulk && product.variants.length ? Math.min(...product.variants.map((v) => v.regularPrice ?? v.price)) : null);
  const tiers = bulk && tableRegular !== null ? bulkRows(bulk, tableRegular, quantity, flashPercent) : null;
  const stock = variant ? variant.stock : product.variants.length ? product.variants.reduce((n, v) => n + v.stock, 0) : product.stock;
  const soldOut = stock <= 0;

  async function buy(thenCart: boolean) {
    if (!customer) return router.push('/login');
    if (missing) return Alert.alert(fill(t.product.choose, { option: missing.name }));
    try {
      await add.mutateAsync({ productId: product.id, variantId: variant?.id ?? null, quantity });
      if (thenCart) router.navigate('/cart');
      else
        Alert.alert(t.product.added, undefined, [
          { text: t.common.close, style: 'cancel' },
          { text: t.product.viewCart, onPress: () => router.navigate('/cart') },
        ]);
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.common.error);
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: themeBg }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Gallery images={product.imageUrls} />
        <View style={styles.body}>
          <Card style={styles.card}>
            {product.flashSale && <Pill tone="sale" label={`⚡ -${product.flashSale.percent}%`} />}
            <View style={styles.priceRow}>
              <ThemedText type="title" themeColor="sale" style={styles.price}>
                {priceRange(price, priceMax)}
              </ThemedText>
              {!!compareAt && compareAt > price && !priceMax && (
                <ThemedText type="small" themeColor="textSecondary" style={styles.strike}>
                  {money(compareAt)}
                </ThemedText>
              )}
            </View>
            <ThemedText type="subtitle">{product.name}</ThemedText>
            <View style={styles.metaRow}>
              {product.ratingAvg > 0 && (
                <View style={styles.inline}>
                  <Icon name="star" size={14} color={theme.star} />
                  <ThemedText type="caption" themeColor="textSecondary">
                    {product.ratingAvg.toFixed(1)} ({product.ratingCount})
                  </ThemedText>
                </View>
              )}
              {product.soldCount > 0 && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {fill(t.product.sold, { n: count(product.soldCount, locale) })}
                </ThemedText>
              )}
            </View>
          </Card>

          {tiers && (
            <Card style={styles.card}>
              <ThemedText type="smallBold">{t.product.bulkTitle}</ThemedText>
              <View style={styles.tiers}>
                {tiers.map((r) => (
                  <View
                    key={r.from}
                    style={[styles.tier, { borderColor: r.active ? theme.sale : theme.border, backgroundColor: r.active ? theme.primarySoft : 'transparent' }]}>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {r.to === null ? fill(t.product.bulkFrom, { n: r.from }) : r.to === r.from ? fill(t.product.bulkExact, { n: r.from }) : fill(t.product.bulkRange, { from: r.from, to: r.to })}
                    </ThemedText>
                    <ThemedText type="smallBold" themeColor={r.active ? 'sale' : 'text'}>
                      {fill(t.product.bulkEach, { price: money(r.price) })}
                    </ThemedText>
                  </View>
                ))}
              </View>
              {product.variants.length > 0 && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {t.product.bulkNote}
                </ThemedText>
              )}
            </Card>
          )}

          <ShopCard product={product} />

          {
            <Card style={styles.card}>
              {product.options.map((o) => (
                <View key={o.name} style={styles.option}>
                  <ThemedText type="smallBold">{o.name}</ThemedText>
                  <View style={styles.values}>
                    {o.values.map((value) => (
                      <Pill key={value} label={value} selected={picked[o.name] === value} onPress={() => setPicked((p) => ({ ...p, [o.name]: value }))} />
                    ))}
                  </View>
                </View>
              ))}
              <View style={styles.quantityRow}>
                <View>
                  <ThemedText type="smallBold">{t.product.quantity}</ThemedText>
                  <ThemedText type="caption" themeColor={soldOut ? 'sale' : 'textSecondary'}>
                    {soldOut ? t.product.outOfStock : fill(t.product.stock, { n: stock })}
                  </ThemedText>
                </View>
                <Stepper value={quantity} max={Math.max(1, stock)} onChange={setQuantity} />
              </View>
            </Card>
          }

          {!!product.description && (
            <Card style={styles.card}>
              <ThemedText type="subtitle">{t.product.details}</ThemedText>
              <ThemedText type="small" style={styles.description}>
                {product.description}
              </ThemedText>
            </Card>
          )}

          <MoreProducts title={t.product.moreFromShop} query={`shop=${encodeURIComponent(product.shop.slug)}&exclude=${product.id}&limit=6`} />
          <MoreProducts title={t.product.related} query={`category=${encodeURIComponent(product.category.slug)}&exclude=${product.id}&limit=12`} />
        </View>
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
        <Button
          label={t.product.addToCart}
          icon="cart"
          variant="outline"
          disabled={soldOut}
          loading={add.isPending}
          onPress={() => void buy(false)}
          style={styles.flex}
        />
        <Button label={soldOut ? t.product.outOfStock : t.product.buyNow} disabled={soldOut} onPress={() => void buy(true)} style={styles.flex} />
      </View>
    </View>
  );
}

/** A row of other products under the page, as on the website: more from this shop, then related (same category). */
function MoreProducts({ title, query }: { title: string; query: string }) {
  const list = useQuery({ queryKey: ['products', 'more', query], queryFn: () => api<ProductCardData[]>(`/products?${query}`) });
  if (!list.data?.length) return null;
  return (
    <View style={styles.more}>
      <SectionTitle title={title} />
      <ProductGrid products={list.data} />
    </View>
  );
}

/**
 * The seller, as the website's shop card: name, verified badge and product count, with Follow
 * and Chat with shop. Chat opens (or creates) the conversation with this product attached.
 * A shop owner sees neither on their own products.
 */
function ShopCard({ product }: { product: ProductDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { customer } = useAuth();
  const shop = product.shop;
  const own = customer?.shop?.id === shop.id;
  const followKey = ['follow', 'shop', shop.id] as const;
  const following = useQuery({
    queryKey: followKey,
    enabled: !!customer && !own,
    queryFn: async () => (await api<{ shopIds: string[] }>(`/me/follows/status?ids=${shop.id}`)).shopIds.includes(shop.id),
  });
  const [opening, setOpening] = useState(false);

  async function toggleFollow() {
    if (!customer) return router.push('/login');
    const on = !following.data;
    queryClient.setQueryData(followKey, on);
    try {
      await api(`/me/follows/${shop.id}`, { method: on ? 'PUT' : 'DELETE' });
      void queryClient.invalidateQueries({ queryKey: ['me', 'follows'] });
    } catch {
      queryClient.setQueryData(followKey, !on);
    }
  }

  async function chat() {
    if (!customer) return router.push('/login');
    setOpening(true);
    try {
      const res = await api<{ id: string }>('/me/conversations', { method: 'POST', body: { shop: shop.slug } });
      router.push({ pathname: '/messages/[id]', params: { id: res.id, product: product.id } });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      Alert.alert(code === 'OWN_SHOP' ? t.product.ownShopChat : code === 'SHOP_NOT_FOUND' ? t.product.shopUnavailable : t.common.error);
    } finally {
      setOpening(false);
    }
  }

  return (
    <Card style={styles.card}>
      <View style={styles.shop}>
        <View style={[styles.shopLogo, { backgroundColor: theme.primarySoft }]}>
          {shop.logoUrl ? <Image source={shop.logoUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="shop" size={20} color={theme.primary} />}
        </View>
        <View style={styles.flex}>
          <View style={styles.inline}>
            <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
              {shop.name}
            </ThemedText>
            {shop.verified && <Icon name="verified" size={16} color={theme.primary} />}
          </View>
          <ThemedText type="caption" themeColor="textSecondary">
            {fill(t.product.products, { n: shop.productCount })}
          </ThemedText>
        </View>
      </View>
      {!own && (
        <View style={styles.shopActions}>
          <Button
            label={following.data ? t.product.following : t.product.follow}
            icon={following.data ? undefined : 'add'}
            variant={following.data ? 'outline' : 'primary'}
            onPress={() => void toggleFollow()}
            style={[styles.flex, styles.small]}
          />
          <Button label={t.product.chatWithShop} icon="chat" variant="outline" loading={opening} onPress={() => void chat()} style={[styles.flex, styles.small]} />
        </View>
      )}
    </Card>
  );
}

/** Swipeable photos with a "2 / 5" counter. */
function Gallery({ images }: { images: string[] }) {
  const theme = useTheme();
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen, MaxContentWidth);
  const [index, setIndex] = useState(0);
  if (!images.length)
    return (
      <View style={[styles.noPhoto, { width, height: width, backgroundColor: theme.backgroundElement }]}>
        <Icon name="package" size={64} color={theme.textSecondary} />
      </View>
    );
  return (
    <View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {images.map((src) => (
          <Image key={src} source={src} style={{ width, height: width, backgroundColor: theme.backgroundElement }} contentFit="contain" transition={150} />
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View style={styles.counter}>
          <ThemedText type="caption" style={styles.counterText}>
            {index + 1} / {images.length}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  more: { gap: Spacing.two },
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  scroll: { paddingBottom: Spacing.five },
  body: { padding: Spacing.three, gap: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.two },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: Spacing.two },
  price: { fontSize: 26 },
  strike: { textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  shop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  shopActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  small: { minHeight: 42 },
  shrink: { flexShrink: 1 },
  shopLogo: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  option: { gap: Spacing.two, marginBottom: Spacing.one },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  description: { lineHeight: 22 },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tier: { flexGrow: 1, minWidth: 100, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  bar: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', right: Spacing.three, bottom: Spacing.three, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: Radius.full, paddingHorizontal: Spacing.two + 2 },
  counterText: { color: '#ffffff', fontVariant: ['tabular-nums'] },
});

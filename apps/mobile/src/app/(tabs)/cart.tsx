import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useCart, useCartActions } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import type { CartItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/** The cart, grouped by shop like the website; Checkout opens the app's own checkout with every orderable line. */
export default function CartScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useI18n();
  const { customer } = useAuth();
  const cart = useCart();
  const { setQuantity, remove } = useCartActions();

  const items = cart.data?.shops.flatMap((s) => s.items) ?? [];
  // Lines that can be ordered: in stock, and not from the customer's own shop (OWN_PRODUCT).
  const buyable = items.filter((i) => i.available && !i.ownShop);
  const total = buyable.reduce((n, i) => n + i.lineTotal, 0);

  let body;
  if (!customer)
    body = (
      <EmptyState
        icon="cart"
        title={t.cart.signInTitle}
        body={t.cart.signInBody}
        action={<Button label={t.account.signIn} onPress={() => router.push('/login')} style={styles.action} />}
      />
    );
  else if (cart.isPending) body = <Loading />;
  else if (cart.isError) body = <LoadError onRetry={() => void cart.refetch()} />;
  else if (!items.length)
    body = (
      <EmptyState
        icon="bag"
        title={t.cart.emptyTitle}
        body={t.cart.emptyBody}
        action={<Button label={t.cart.continueShopping} onPress={() => router.navigate('/')} style={styles.action} />}
      />
    );
  else
    body = cart.data!.shops.map(({ shop, items: lines }) => (
      <Card key={shop.id} style={styles.shopCard}>
        <View style={[styles.shopRow, { borderBottomColor: theme.border }]}>
          <Icon name="shop" size={16} color={theme.primary} />
          <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
            {shop.name}
          </ThemedText>
        </View>
        {lines.map((item, i) => (
          <Line
            key={item.id}
            item={item}
            first={i === 0}
            onQuantity={(quantity) => setQuantity.mutate({ itemId: item.id, quantity })}
            onRemove={() => remove.mutate(item.id)}
            shopSlug={shop.slug}
          />
        ))}
        <ShopSubtotal lines={lines} />
      </Card>
    ));

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.three }]}
        refreshControl={customer ? <RefreshControl refreshing={cart.isRefetching} onRefresh={() => void cart.refetch()} tintColor={theme.primary} /> : undefined}>
        <ThemedText type="title">{t.cart.title}</ThemedText>
        {body}
      </ScrollView>
      {buyable.length > 0 && (
        <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={styles.flex}>
            <ThemedText type="caption" themeColor="textSecondary">
              {t.cart.total}
            </ThemedText>
            <ThemedText type="subtitle" themeColor="primary">
              {money(total)}
            </ThemedText>
          </View>
          <Button label={fill(t.cart.checkout, { n: buyable.length })} onPress={() => router.push({ pathname: '/checkout', params: { items: buyable.map((i) => i.id).join(',') } })} />
        </View>
      )}
    </View>
  );
}

function Line({ item, first, onQuantity, onRemove, shopSlug }: { item: CartItem; first: boolean; onQuantity: (n: number) => void; onRemove: () => void; shopSlug: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  return (
    <View style={[styles.line, !first && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }, !item.available && styles.dim]}>
      <Pressable onPress={() => router.push(`/product/${shopSlug}/${item.productSlug}`)} style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
        {item.imageUrl && <Image source={item.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
      </Pressable>
      <View style={[styles.flex, styles.lineBody]}>
        <ThemedText type="small" numberOfLines={2}>
          {item.name}
        </ThemedText>
        {item.variantLabel && (
          <ThemedText type="caption" themeColor="textSecondary">
            {item.variantLabel}
          </ThemedText>
        )}
        <View style={styles.priceRow}>
          <ThemedText type="smallBold" themeColor={item.available ? 'primary' : 'textSecondary'}>
            {item.available ? money(item.unitPrice) : t.cart.unavailable}
            {item.available && (
              <ThemedText type="caption" themeColor="textSecondary">
                {' '}
                {t.cart.each}
              </ThemedText>
            )}
          </ThemedText>
          {item.available && Math.max(item.compareAtPrice ?? 0, item.bulk ? item.basePrice : 0) > item.unitPrice && (
            <ThemedText type="caption" themeColor="textSecondary" style={styles.strike}>
              {money(Math.max(item.compareAtPrice ?? 0, item.bulk ? item.basePrice : 0))}
            </ThemedText>
          )}
        </View>
        {item.available && item.bulk && (
          <ThemedText type="caption" themeColor="sale">
            {fill(t.cart.bulkApplied, { n: item.bulk.quantity })}
          </ThemedText>
        )}
        {item.available && item.nextBulk && (
          <ThemedText type="caption" themeColor="primary">
            {fill(t.cart.bulkNext, { n: item.nextBulk.more, price: money(item.nextBulk.unitPrice) })}
          </ThemedText>
        )}
        <View style={styles.lineActions}>
          <Stepper value={item.quantity} max={Math.max(1, item.stock)} onChange={onQuantity} disabled={!item.available} />
          <Pressable accessibilityRole="button" accessibilityLabel={t.cart.remove} onPress={onRemove} hitSlop={8}>
            <Icon name="trash" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
        {/* Quantity × price per item = this line's total (bulk prices included). */}
        {item.available && (
          <View style={styles.lineTotal}>
            <ThemedText type="caption" themeColor="textSecondary">
              {fill(t.cart.lineTotal, { n: item.quantity, price: money(item.unitPrice) })}
            </ThemedText>
            <ThemedText type="smallBold">{money(item.lineTotal)}</ThemedText>
          </View>
        )}
      </View>
    </View>
  );
}

/** The shop's items that can be ordered: units and their total. */
function ShopSubtotal({ lines }: { lines: CartItem[] }) {
  const theme = useTheme();
  const { t } = useI18n();
  const buyable = lines.filter((i) => i.available && !i.ownShop);
  if (!buyable.length) return null;
  return (
    <View style={[styles.subtotal, { borderTopColor: theme.border, backgroundColor: theme.backgroundElement }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {fill(t.cart.shopSubtotal, { n: buyable.reduce((n, i) => n + i.quantity, 0) })}
      </ThemedText>
      <ThemedText type="smallBold" themeColor="primary">
        {money(buyable.reduce((n, i) => n + i.lineTotal, 0))}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  shopCard: { overflow: 'hidden' },
  lineTotal: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two, marginTop: Spacing.one },
  subtotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderTopWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  action: { marginTop: Spacing.two },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three },
  dim: { opacity: 0.6 },
  thumb: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden' },
  lineBody: { gap: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  strike: { textDecorationLine: 'line-through' },
  lineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderTopWidth: StyleSheet.hairlineWidth },
});

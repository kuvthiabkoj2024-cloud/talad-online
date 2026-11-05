import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useCart, useCartActions } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import { SITE_URL, type CartItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { money } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/**
 * The cart, grouped by shop like the website. Checking out (address, courier, payment) opens the
 * website's checkout for now.
 */
export default function CartScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { customer } = useAuth();
  const cart = useCart();
  const { setQuantity, remove } = useCartActions();

  const items = cart.data?.shops.flatMap((s) => s.items) ?? [];
  const buyable = items.filter((i) => i.available);
  const total = buyable.reduce((n, i) => n + i.lineTotal, 0);
  const units = buyable.reduce((n, i) => n + i.quantity, 0);

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
      <Card key={shop.id}>
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
          <Button label={fill(t.cart.checkout, { n: units })} onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/${locale}/cart`)} />
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
        <ThemedText type="smallBold" themeColor={item.available ? 'primary' : 'textSecondary'}>
          {item.available ? money(item.unitPrice) : t.cart.unavailable}
        </ThemedText>
        <View style={styles.lineActions}>
          <Stepper value={item.quantity} max={Math.max(1, item.stock)} onChange={onQuantity} disabled={!item.available} />
          <Pressable accessibilityRole="button" accessibilityLabel={t.cart.remove} onPress={onRemove} hitSlop={8}>
            <Icon name="trash" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  action: { marginTop: Spacing.two },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  line: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three },
  dim: { opacity: 0.6 },
  thumb: { width: 76, height: 76, borderRadius: 10, overflow: 'hidden' },
  lineBody: { gap: 2 },
  lineActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  bar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderTopWidth: StyleSheet.hairlineWidth },
});

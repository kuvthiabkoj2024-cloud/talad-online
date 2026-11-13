import { flashPrice, FLASH_SALE_RULES } from '@talad/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { DateField, datePresets, parseLocalText, toLocalText } from '@/components/seller/date-field';
import { Sheet } from '@/components/seller/sheet';
import { SellerScroll, sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { date, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

type SaleState = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'INACTIVE';
interface ShopFlashSale {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  state: SaleState;
  items: { productId: string; name: string; imageUrl: string | null; discountPercent: number; price: number; salePrice: number }[];
}
type Item = { productId: string; name: string; imageUrl: string | null; price: number; percent: string };

const STATE_COLOR: Record<SaleState, string> = { ACTIVE: '#16a34a', SCHEDULED: '#2563eb', ENDED: '#6b7280', INACTIVE: '#9ca3af' };

/** Flash sales (§3.4): a few days of lower prices on chosen products. */
export default function SellerMarketingScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { s, locale } = useSellerI18n();
  const m = s.marketing;
  const sales = useQuery({ queryKey: ['seller', 'flash-sales'], queryFn: () => api<ShopFlashSale[]>('/me/shop/flash-sales') });
  const [editing, setEditing] = useState<ShopFlashSale | 'new' | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['seller', 'flash-sales'] });

  function remove(sale: ShopFlashSale) {
    Alert.alert(m.deleteTitle, m.deleteBody, [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: s.editor.remove,
        style: 'destructive',
        onPress: () =>
          void api(`/me/shop/flash-sales/${sale.id}`, { method: 'DELETE' })
            .then(() => (refresh(), Alert.alert(m.deleted)))
            .catch(() => Alert.alert(s.common.saveError)),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: m.title,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={m.create} onPress={() => setEditing('new')} hitSlop={10}>
              <Icon name="add" size={26} color={theme.primary} />
            </Pressable>
          ),
        }}
      />
      <SellerScroll loading={sales.isPending} error={sales.isError} refreshing={sales.isRefetching} onRefresh={() => void sales.refetch()}>
        {sales.data && !sales.data.length && (
          <EmptyState icon="flash" title={m.emptyTitle} body={m.emptyBody} action={<Button label={m.create} icon="add" onPress={() => setEditing('new')} style={styles.action} />} />
        )}
        {sales.data?.map((sale) => (
          <Card key={sale.id} style={sellerStyles.card}>
            <View style={styles.head}>
              <ThemedText type="smallBold" style={styles.flex}>
                ⚡ {sale.name}
              </ThemedText>
              <ThemedText type="caption" style={{ color: STATE_COLOR[sale.state], fontWeight: '700' }}>
                {m.states[sale.state]}
              </ThemedText>
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              {date(sale.startsAt, locale)} – {date(sale.endsAt, locale)} · {fill(m.itemCount, { n: sale.items.length })}
            </ThemedText>
            <View style={styles.thumbs}>
              {sale.items.slice(0, 6).map((it) => (
                <View key={it.productId} style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                  {it.imageUrl && <Image source={it.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
                  <View style={[styles.pct, { backgroundColor: theme.sale }]}>
                    <ThemedText style={styles.pctText}>-{it.discountPercent}%</ThemedText>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.head}>
              <Button label={m.editTitle} icon="edit" variant="outline" onPress={() => setEditing(sale)} style={styles.small} />
              <Pressable accessibilityLabel={s.editor.remove} onPress={() => remove(sale)} hitSlop={8}>
                <Icon name="trash" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          </Card>
        ))}
      </SellerScroll>
      {editing && <SaleSheet sale={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />}
    </>
  );
}

function SaleSheet({ sale, onClose, onSaved }: { sale: ShopFlashSale | null; onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();
  const { s } = useSellerI18n();
  const m = s.marketing;
  const [name, setName] = useState(sale?.name ?? '');
  const [startsAt, setStartsAt] = useState(toLocalText(sale ? new Date(sale.startsAt) : new Date()));
  const [endsAt, setEndsAt] = useState(toLocalText(sale ? new Date(sale.endsAt) : datePresets.inDays(3)));
  const [active, setActive] = useState(sale?.isActive ?? true);
  const [items, setItems] = useState<Item[]>(() => sale?.items.map((it) => ({ productId: it.productId, name: it.name, imageUrl: it.imageUrl, price: it.price, percent: String(it.discountPercent) })) ?? []);
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [setAll, setSetAll] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(id);
  }, [typed]);
  const products = useQuery({
    queryKey: ['seller', 'sale-products', q],
    queryFn: () => api<{ items: { id: string; name: string; imageUrl: string | null; price: number }[] }>(`/me/shop/products?status=PUBLISHED&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  const picked = new Set(items.map((i) => i.productId));

  async function save() {
    const start = parseLocalText(startsAt);
    const end = parseLocalText(endsAt);
    if (!name.trim()) return Alert.alert(m.errors.name);
    if (!start || !end || end <= start) return Alert.alert(m.errors.dates);
    if (!items.length) return Alert.alert(m.errors.items);
    if (items.some((i) => !(Number(i.percent) >= FLASH_SALE_RULES.minPercent && Number(i.percent) <= FLASH_SALE_RULES.maxPercent))) return Alert.alert(m.errors.percent);
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        isActive: active,
        items: items.map((i) => ({ productId: i.productId, discountPercent: Number(i.percent) })),
      };
      await api(sale ? `/me/shop/flash-sales/${sale.id}` : '/me/shop/flash-sales', { method: sale ? 'PUT' : 'POST', body });
      onSaved();
      onClose();
      Alert.alert(m.saved);
    } catch (e) {
      const key = e instanceof ApiError ? e.code : undefined;
      Alert.alert((key && (m.errors as Record<string, string>)[key]) || s.common.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible title={sale ? m.editTitle : m.createTitle} onClose={onClose}>
      <Field label={m.name}>
        <Input value={name} onChangeText={setName} placeholder={m.namePlaceholder} maxLength={FLASH_SALE_RULES.nameMax} />
      </Field>
      <DateField label={m.startsAt} value={startsAt} onChange={setStartsAt} presets={[{ label: m.presets.today, date: new Date() }]} />
      <DateField
        label={m.endsAt}
        value={endsAt}
        onChange={setEndsAt}
        presets={[
          { label: m.presets.today, date: datePresets.endOfToday() },
          { label: m.presets.threeDays, date: datePresets.inDays(3) },
          { label: m.presets.week, date: datePresets.inDays(7) },
          { label: m.presets.endOfMonth, date: datePresets.endOfMonth() },
        ]}
      />
      <ThemedText type="caption" themeColor="textSecondary">
        {fill(m.maxDaysHint, { days: FLASH_SALE_RULES.maxDays, min: FLASH_SALE_RULES.minPercent, max: FLASH_SALE_RULES.maxPercent })}
      </ThemedText>
      <View style={styles.head}>
        <ThemedText type="smallBold" style={styles.flex}>
          {m.active}
        </ThemedText>
        <Switch value={active} onValueChange={setActive} trackColor={{ true: theme.primary }} />
      </View>

      <ThemedText type="smallBold">
        {m.products} ({items.length})
      </ThemedText>
      {items.length > 1 && (
        <View style={styles.head}>
          <Input value={setAll} onChangeText={(v) => setSetAll(v.replace(/\D/g, ''))} placeholder={`${m.setAll} %`} keyboardType="number-pad" style={styles.flex} />
          <Button label={m.apply} variant="outline" onPress={() => setAll && setItems((l) => l.map((i) => ({ ...i, percent: setAll })))} style={styles.small} />
        </View>
      )}
      {items.map((it) => (
        <View key={it.productId} style={[styles.item, { borderColor: theme.border }]}>
          <View style={[styles.thumbSmall, { backgroundColor: theme.backgroundElement }]}>
            {it.imageUrl && <Image source={it.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
          </View>
          <View style={styles.flex}>
            <ThemedText type="small" numberOfLines={1}>
              {it.name}
            </ThemedText>
            <ThemedText type="caption" themeColor="sale">
              {Number(it.percent) > 0 ? `${m.salePrice} ${money(flashPrice(it.price, Number(it.percent)))}` : money(it.price)}
            </ThemedText>
          </View>
          <Input value={it.percent} onChangeText={(v) => setItems((l) => l.map((x) => (x.productId === it.productId ? { ...x, percent: v.replace(/\D/g, '') } : x)))} keyboardType="number-pad" style={styles.percent} />
          <ThemedText type="small">%</ThemedText>
          <Pressable accessibilityLabel={m.remove} onPress={() => setItems((l) => l.filter((x) => x.productId !== it.productId))} hitSlop={6}>
            <Icon name="x" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
      ))}

      <Field label={m.addProducts}>
        <Input value={typed} onChangeText={setTyped} placeholder={m.searchProducts} autoCorrect={false} />
      </Field>
      {products.data?.items
        .filter((p) => !picked.has(p.id))
        .map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            disabled={items.length >= FLASH_SALE_RULES.maxItems}
            onPress={() => setItems((l) => [...l, { productId: p.id, name: p.name, imageUrl: p.imageUrl, price: p.price, percent: '10' }])}
            style={[styles.item, { borderColor: theme.border }]}>
            <View style={[styles.thumbSmall, { backgroundColor: theme.backgroundElement }]}>
              {p.imageUrl && <Image source={p.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
            </View>
            <ThemedText type="small" numberOfLines={1} style={styles.flex}>
              {p.name}
            </ThemedText>
            <Icon name="add" size={20} color={theme.primary} />
          </Pressable>
        ))}
      <Button label={s.common.save} loading={saving} onPress={() => void save()} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  action: { marginTop: Spacing.two, alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  thumbs: { flexDirection: 'row', gap: Spacing.two },
  thumb: { width: 48, height: 48, borderRadius: Radius.sm, overflow: 'hidden' },
  pct: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  pctText: { color: '#ffffff', fontSize: 9, lineHeight: 13, fontWeight: '700' },
  small: { minHeight: 38, paddingHorizontal: Spacing.three },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two },
  thumbSmall: { width: 40, height: 40, borderRadius: Radius.sm, overflow: 'hidden' },
  percent: { width: 64, textAlign: 'center' },
});

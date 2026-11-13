import { COUPON_RULES } from '@talad/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { DateField, datePresets, parseLocalText, toLocalText } from '@/components/seller/date-field';
import { Sheet } from '@/components/seller/sheet';
import { Choices, SellerScroll, sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { date, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

type CouponState = 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP' | 'INACTIVE';
interface ShopCoupon {
  id: string;
  code: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  minOrderAmount: number | null;
  maxDiscount: number | null;
  usageLimit: number | null;
  perCustomer: number | null;
  usedCount: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  state: CouponState;
  batchId: string | null;
}

const STATE_COLOR: Record<CouponState, string> = { ACTIVE: '#16a34a', SCHEDULED: '#2563eb', EXPIRED: '#6b7280', USED_UP: '#6b7280', INACTIVE: '#9ca3af' };

/** The shop's discount codes (§3.4): single codes for everyone, or batches of one-per-customer codes. */
export default function SellerCouponsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { s, locale } = useSellerI18n();
  const c = s.coupons;
  const coupons = useQuery({ queryKey: ['seller', 'coupons'], queryFn: () => api<ShopCoupon[]>('/me/shop/coupons') });
  const [editing, setEditing] = useState<ShopCoupon | 'new' | null>(null);
  const [batch, setBatch] = useState<{ id: string; codes: ShopCoupon[] } | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['seller', 'coupons'] });

  const singles = coupons.data?.filter((x) => !x.batchId) ?? [];
  const batches = Object.values(
    (coupons.data ?? [])
      .filter((x) => x.batchId)
      .reduce<Record<string, { id: string; codes: ShopCoupon[] }>>((acc, x) => {
        (acc[x.batchId!] ??= { id: x.batchId!, codes: [] }).codes.push(x);
        return acc;
      }, {}),
  );

  const discount = (x: ShopCoupon) =>
    x.type === 'PERCENTAGE'
      ? `${fill(c.percentOff, { n: x.value })}${x.maxDiscount ? ` · ${fill(c.upTo, { amount: money(x.maxDiscount) })}` : ''}`
      : fill(c.amountOff, { amount: money(x.value) });

  async function toggle(x: ShopCoupon) {
    try {
      await api(`/me/shop/coupons/${x.id}`, { method: 'PATCH', body: { isActive: !x.isActive } });
      void refresh();
    } catch {
      Alert.alert(s.common.saveError);
    }
  }

  function remove(x: ShopCoupon) {
    Alert.alert(c.deleteTitle, c.deleteBody, [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: s.editor.remove,
        style: 'destructive',
        onPress: () =>
          void api(`/me/shop/coupons/${x.id}`, { method: 'DELETE' })
            .then(() => (refresh(), Alert.alert(c.deleted)))
            .catch((e) => Alert.alert(e instanceof ApiError && e.code === 'COUPON_USED' ? c.usedCantDelete : s.common.saveError)),
      },
    ]);
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: c.title,
          headerRight: () => (
            <Pressable accessibilityRole="button" accessibilityLabel={c.create} onPress={() => setEditing('new')} hitSlop={10}>
              <Icon name="add" size={26} color={theme.primary} />
            </Pressable>
          ),
        }}
      />
      <SellerScroll loading={coupons.isPending} error={coupons.isError} refreshing={coupons.isRefetching} onRefresh={() => void coupons.refetch()}>
        {coupons.data && !coupons.data.length && (
          <EmptyState icon="coupon" title={c.emptyTitle} body={c.emptyBody} action={<Button label={c.create} icon="add" onPress={() => setEditing('new')} style={styles.action} />} />
        )}
        {singles.map((x) => (
          <Card key={x.id} style={sellerStyles.card}>
            <View style={styles.head}>
              <ThemedText type="subtitle" selectable style={styles.code}>
                {x.code}
              </ThemedText>
              <ThemedText type="caption" style={{ color: STATE_COLOR[x.state], fontWeight: '700' }}>
                {c.states[x.state]}
              </ThemedText>
            </View>
            <ThemedText type="small">{discount(x)}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {x.minOrderAmount ? fill(c.minSpend, { amount: money(x.minOrderAmount) }) : c.noMin} · {date(x.startsAt, locale)} – {date(x.endsAt, locale)}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {x.usageLimit ? fill(c.used, { used: x.usedCount, limit: x.usageLimit }) : fill(c.usedUnlimited, { used: x.usedCount })}
            </ThemedText>
            <View style={styles.actions}>
              <Switch value={x.isActive} onValueChange={() => void toggle(x)} trackColor={{ true: theme.primary }} accessibilityLabel={c.active} />
              <View style={styles.flex} />
              <Button label={c.editTitle} variant="outline" icon="edit" onPress={() => setEditing(x)} style={styles.small} />
              <Pressable accessibilityLabel={s.editor.remove} onPress={() => remove(x)} hitSlop={8}>
                <Icon name="trash" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>
          </Card>
        ))}
        {batches.map((b) => {
          const first = b.codes[0];
          const used = b.codes.filter((x) => x.usedCount > 0).length;
          return (
            <Card key={b.id} style={sellerStyles.card}>
              <View style={styles.head}>
                <ThemedText type="smallBold">{fill(c.batchName, { n: b.codes.length })}</ThemedText>
                <ThemedText type="caption" style={{ color: STATE_COLOR[first.state], fontWeight: '700' }}>
                  {c.states[first.state]}
                </ThemedText>
              </View>
              <ThemedText type="small">{discount(first)}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {fill(c.batchUsed, { used, n: b.codes.length })} · {date(first.startsAt, locale)} – {date(first.endsAt, locale)}
              </ThemedText>
              <Button label={c.viewCodes} variant="outline" onPress={() => setBatch(b)} style={styles.small} />
            </Card>
          );
        })}
      </SellerScroll>
      {editing && <CouponSheet coupon={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => void refresh()} />}
      {batch && <BatchSheet batch={batch} onClose={() => setBatch(null)} onChanged={() => void refresh()} />}
    </>
  );
}

/** Create a code (or a batch), or edit one. */
function CouponSheet({ coupon, onClose, onSaved }: { coupon: ShopCoupon | null; onClose: () => void; onSaved: () => void }) {
  const theme = useTheme();
  const { s } = useSellerI18n();
  const c = s.coupons;
  const [mode, setMode] = useState<'single' | 'batch'>('single');
  const [code, setCode] = useState(coupon?.code ?? '');
  const [type, setType] = useState<'PERCENTAGE' | 'FIXED_AMOUNT'>(coupon?.type ?? 'PERCENTAGE');
  const [value, setValue] = useState(coupon ? String(coupon.value) : '');
  const [maxDiscount, setMaxDiscount] = useState(coupon?.maxDiscount ? String(coupon.maxDiscount) : '');
  const [minOrder, setMinOrder] = useState(coupon?.minOrderAmount ? String(coupon.minOrderAmount) : '');
  const [usageLimit, setUsageLimit] = useState(coupon?.usageLimit ? String(coupon.usageLimit) : '');
  const [perCustomer, setPerCustomer] = useState(coupon?.perCustomer ? String(coupon.perCustomer) : '1');
  const [quantity, setQuantity] = useState('50');
  const [prefix, setPrefix] = useState('');
  const [startsAt, setStartsAt] = useState(toLocalText(coupon ? new Date(coupon.startsAt) : new Date()));
  const [endsAt, setEndsAt] = useState(toLocalText(coupon ? new Date(coupon.endsAt) : datePresets.inDays(30)));
  const [active, setActive] = useState(coupon?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const optional = (v: string) => (v.trim() ? Number(v) : null);

  async function save() {
    const start = parseLocalText(startsAt);
    const end = parseLocalText(endsAt);
    if (!start || !end || end <= start) return Alert.alert(c.errors.dates);
    if (!(Number(value) > 0)) return Alert.alert(c.errors.value);
    if (type === 'PERCENTAGE' && Number(value) > COUPON_RULES.maxPercent) return Alert.alert(c.errors.percent);
    if (mode === 'single' && !COUPON_RULES.codePattern.test(code.trim())) return Alert.alert(c.errors.code);
    if (mode === 'batch' && !(Number(quantity) >= 1 && Number(quantity) <= COUPON_RULES.batchMax)) return Alert.alert(c.errors.quantity);
    if (mode === 'batch' && !COUPON_RULES.prefixPattern.test(prefix.trim())) return Alert.alert(c.errors.prefix);
    const rules = {
      type,
      value: Number(value),
      minOrderAmount: optional(minOrder),
      maxDiscount: type === 'PERCENTAGE' ? optional(maxDiscount) : null,
      perCustomer: optional(perCustomer),
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      isActive: active,
    };
    setSaving(true);
    try {
      if (coupon) await api(`/me/shop/coupons/${coupon.id}`, { method: 'PUT', body: { ...rules, code: code.trim(), usageLimit: optional(usageLimit) } });
      else if (mode === 'single') await api('/me/shop/coupons', { method: 'POST', body: { ...rules, code: code.trim(), usageLimit: optional(usageLimit) } });
      else await api('/me/shop/coupons/batch', { method: 'POST', body: { ...rules, quantity: Number(quantity), prefix: prefix.trim() || undefined, usesPerCode: 1 } });
      onSaved();
      onClose();
      Alert.alert(mode === 'batch' && !coupon ? c.batchCreated : c.saved);
    } catch (e) {
      const key = e instanceof ApiError ? e.code : undefined;
      Alert.alert((key && (c.errors as Record<string, string>)[key]) || s.common.saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet visible title={coupon ? c.editTitle : c.createTitle} onClose={onClose}>
      {!coupon && (
        <Choices
          value={mode}
          onChange={setMode}
          options={[
            { key: 'single', label: c.modeSingle },
            { key: 'batch', label: c.modeBatch },
          ]}
        />
      )}
      {mode === 'single' ? (
        <Field label={c.code} hint={c.codeHint}>
          <Input value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} autoCapitalize="characters" autoCorrect={false} maxLength={20} />
        </Field>
      ) : (
        <>
          <Field label={c.quantity}>
            <Input value={quantity} onChangeText={(v) => setQuantity(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          </Field>
          <Field label={c.prefix} hint={c.prefixHint}>
            <Input value={prefix} onChangeText={(v) => setPrefix(v.toUpperCase().replace(/[^A-Z0-9]/g, ''))} autoCapitalize="characters" maxLength={8} />
          </Field>
        </>
      )}
      <Choices
        value={type}
        onChange={setType}
        options={[
          { key: 'PERCENTAGE', label: c.percentage },
          { key: 'FIXED_AMOUNT', label: c.fixed },
        ]}
      />
      <Field label={type === 'PERCENTAGE' ? c.percentValue : c.amountValue}>
        <Input value={value} onChangeText={(v) => setValue(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
      </Field>
      {type === 'PERCENTAGE' && (
        <Field label={c.maxDiscount}>
          <Input value={maxDiscount} onChangeText={(v) => setMaxDiscount(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        </Field>
      )}
      <Field label={c.minOrder}>
        <Input value={minOrder} onChangeText={(v) => setMinOrder(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      </Field>
      {mode === 'single' && (
        <Field label={c.usageLimit}>
          <Input value={usageLimit} onChangeText={(v) => setUsageLimit(v.replace(/\D/g, ''))} keyboardType="number-pad" />
        </Field>
      )}
      <Field label={c.perCustomer}>
        <Input value={perCustomer} onChangeText={(v) => setPerCustomer(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      </Field>
      <DateField label={c.startsAt} value={startsAt} onChange={setStartsAt} presets={[{ label: '⏱', date: new Date() }]} />
      <DateField
        label={c.endsAt}
        value={endsAt}
        onChange={setEndsAt}
        presets={[
          { label: '7', date: datePresets.inDays(7) },
          { label: '30', date: datePresets.inDays(30) },
          { label: '90', date: datePresets.inDays(90) },
        ]}
      />
      <View style={styles.actions}>
        <ThemedText type="smallBold" style={styles.flex}>
          {c.active}
        </ThemedText>
        <Switch value={active} onValueChange={setActive} trackColor={{ true: theme.primary }} />
      </View>
      <Button label={mode === 'batch' && !coupon ? c.createBatch : s.common.save} loading={saving} onPress={() => void save()} />
    </Sheet>
  );
}

/** A batch's codes (copy them out), switching the whole batch on or off, deleting it. */
function BatchSheet({ batch, onClose, onChanged }: { batch: { id: string; codes: ShopCoupon[] }; onClose: () => void; onChanged: () => void }) {
  const theme = useTheme();
  const { s } = useSellerI18n();
  const c = s.coupons;
  const active = batch.codes[0]?.isActive ?? false;

  async function toggle() {
    try {
      await api(`/me/shop/coupons/batch/${batch.id}`, { method: 'PATCH', body: { isActive: !active } });
      onChanged();
      onClose();
    } catch {
      Alert.alert(s.common.saveError);
    }
  }

  function remove() {
    Alert.alert(c.batchDeleteTitle, c.batchDeleteBody, [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: s.editor.remove,
        style: 'destructive',
        onPress: () =>
          void api<{ deleted?: number; kept?: number }>(`/me/shop/coupons/batch/${batch.id}`, { method: 'DELETE' })
            .then(() => {
              onChanged();
              onClose();
              Alert.alert(c.batchDeleted);
            })
            .catch(() => Alert.alert(s.common.saveError)),
      },
    ]);
  }

  return (
    <Sheet visible title={c.codesTitle} onClose={onClose}>
      <View style={styles.actions}>
        <ThemedText type="smallBold" style={styles.flex}>
          {c.active}
        </ThemedText>
        <Switch value={active} onValueChange={() => void toggle()} trackColor={{ true: theme.primary }} />
      </View>
      <View style={styles.codes}>
        {batch.codes.map((x) => (
          <View key={x.id} style={styles.batchCode}>
            <ThemedText type="small" selectable style={x.usedCount > 0 && { color: theme.textSecondary, textDecorationLine: 'line-through' }}>
              {x.code}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {x.usedCount > 0 ? fill(c.codeUsed, { n: x.usedCount }) : c.codeFree}
            </ThemedText>
          </View>
        ))}
      </View>
      <Button label={c.batchDeleteTitle} icon="trash" variant="outline" onPress={remove} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  action: { marginTop: Spacing.two, alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  code: { letterSpacing: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  small: { minHeight: 38, paddingHorizontal: Spacing.three },
  codes: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  batchCode: { fontVariant: ['tabular-nums'], minWidth: '30%' },
});

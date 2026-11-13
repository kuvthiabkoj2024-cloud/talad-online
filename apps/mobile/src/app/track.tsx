import { formatPhone, provinceName } from '@talad/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Icon, type IconName } from '@/components/icon';
import { Progress } from '@/components/order/progress';
import { ORDER_TONE } from '@/components/seller/order-status';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { BrandGreen, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, type OrderSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, dateTime } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useOrderI18n } from '@/lib/order-i18n';
import type { TrackedOrder } from '@/lib/orders';

/** Checked again this often while a result shows, so the parcel's progress appears by itself. */
const REFRESH_MS = 60_000;

/**
 * Order tracking, as on the website: the order number and a phone number on the order (the
 * buyer's or the receiver's), then where it is. Signed in, the orders on their way are listed
 * below, one tap from their details.
 */
export default function TrackScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { customer } = useAuth();
  const { o, locale } = useOrderI18n();
  const tr = o.track;
  const params = useLocalSearchParams<{ number?: string }>();
  const [number, setNumber] = useState((params.number ?? '').toUpperCase());
  // null until typed: signed in, their own phone is filled in (it's usually theirs).
  const [phone, setPhone] = useState<string | null>(null);
  const phoneValue = phone ?? (customer?.phone ? formatPhone(customer.phone) : '');
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const coming = useQuery({
    queryKey: ['me', 'orders', 'coming'],
    enabled: !!customer,
    queryFn: async () => {
      const [receive, ship] = await Promise.all([
        api<{ orders: OrderSummary[] }>('/me/orders?tab=to-receive&pageSize=5'),
        api<{ orders: OrderSummary[] }>('/me/orders?tab=to-ship&pageSize=5'),
      ]);
      return [...receive.orders, ...ship.orders];
    },
  });

  const lookUp = (n: string, p: string) => api<TrackedOrder>('/orders/track', { method: 'POST', body: { number: n.trim(), phone: p.trim() } });

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      setOrder(await lookUp(number, phoneValue));
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setError(status === 404 || status === 400 ? tr.notFound : status === 429 ? tr.tooMany : tr.error);
    } finally {
      setBusy(false);
    }
  }

  // While a result shows, it refreshes quietly.
  useEffect(() => {
    if (!order) return;
    const id = setInterval(() => {
      void lookUp(order.number, phoneValue)
        .then(setOrder)
        .catch(() => {});
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [order, phoneValue]);

  return (
    <>
      <Stack.Screen options={{ title: tr.title }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {order ? (
          <Result order={order} onAnother={() => setOrder(null)} />
        ) : (
          <Card style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.badgeIcon, { backgroundColor: theme.primarySoft }]}>
                <Icon name="track" size={24} color={theme.primary} />
              </View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {tr.subtitle}
              </ThemedText>
            </View>
            <Field label={tr.number} hint={tr.numberHint}>
              <Input value={number} onChangeText={(v) => setNumber(v.toUpperCase())} placeholder={tr.numberPlaceholder} autoCapitalize="characters" autoCorrect={false} maxLength={40} />
            </Field>
            <Field label={tr.phone}>
              <Input value={phoneValue} onChangeText={setPhone} placeholder={tr.phonePlaceholder} keyboardType="phone-pad" textContentType="telephoneNumber" maxLength={30} />
            </Field>
            {error && (
              <ThemedText type="small" themeColor="sale">
                {error}
              </ThemedText>
            )}
            <Button label={busy ? tr.checking : tr.submit} icon="track" loading={busy} disabled={!number.trim() || !phoneValue.trim()} onPress={() => void submit()} />
          </Card>
        )}

        {customer && (
          <View style={styles.section}>
            <ThemedText type="smallBold">{tr.yourOrders}</ThemedText>
            {coming.data && !coming.data.length && (
              <Card style={styles.card}>
                <ThemedText type="small" themeColor="textSecondary">
                  {tr.yourOrdersEmpty}
                </ThemedText>
              </Card>
            )}
            {coming.data?.map((x) => (
              <Pressable key={x.number} onPress={() => router.push({ pathname: '/orders/[number]', params: { number: x.number } })}>
                {({ pressed }) => (
                  <Card style={[styles.orderRow, pressed && styles.pressed]}>
                    <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                      {x.items[0]?.imageUrl && <Image source={x.items[0].imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
                    </View>
                    <View style={styles.flex}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {x.shop.name}
                      </ThemedText>
                      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                        {x.number} · {date(x.createdAt, locale)}
                      </ThemedText>
                    </View>
                    <StatusBadge status={x.status} label={o.account.orderStatus[x.status]} />
                    <Icon name="chevron-right" size={16} color={theme.textSecondary} />
                  </Card>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Result({ order, onAnother }: { order: TrackedOrder; onAnother: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const { customer } = useAuth();
  const { o, locale } = useOrderI18n();
  const tr = o.track;
  const a = o.account;
  return (
    <>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="subtitle" selectable style={styles.mono}>
              {order.number}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {fill(tr.placedOn, { date: dateTime(order.createdAt, locale) })}
            </ThemedText>
            <ThemedText type="caption" style={styles.bold}>
              {fill(tr.from, { shop: order.shop.name })}
            </ThemedText>
          </View>
          <StatusBadge status={order.status} label={order.pickup && order.status === 'SHIPPED' ? a.stepReadyPickup : a.orderStatus[order.status]} />
        </View>
        {order.status !== 'CANCELLED' && (
          <Progress
            status={order.status}
            labels={[a.stepPlaced, a.stepConfirmed, order.pickup ? a.stepReadyPickup : a.stepShipped, a.stepCompleted]}
            waitingLabels={[a.stepPlaced, a.stepWaitingPayment, order.pickup ? a.stepWaitingPickup : a.stepWaitingShip, a.stepWaitingConfirm]}
          />
        )}
        {order.autoConfirmAt && (
          <ThemedText type="caption" themeColor="textSecondary">
            {fill(a.autoComplete, { date: date(order.autoConfirmAt, locale) })}
          </ThemedText>
        )}
      </Card>

      <Card style={styles.card}>
        {order.pickup ? (
          <ThemedText type="smallBold" themeColor="primary">
            🏪 {tr.pickup}
          </ThemedText>
        ) : (
          order.destination && (
            <Row icon="location" label={tr.deliverTo} value={[order.destination.district, provinceName(order.destination.province, locale)].filter(Boolean).join(', ')} />
          )
        )}
        {order.urgentDelivery && (
          <ThemedText type="smallBold" themeColor="sale">
            ⚡ {tr.urgent}
          </ThemedText>
        )}
        {order.deliveryProvider && <Row icon="truck" label={tr.carrier} value={order.deliveryProvider} />}
        {order.trackingNumber && <Row icon="track" label={tr.trackingNumber} value={order.trackingNumber} selectable />}
        <View style={[styles.items, { borderTopColor: theme.border }]}>
          {order.items.map((item, i) => (
            <View key={i} style={styles.row}>
              <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                {item.imageUrl && <Image source={item.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
              </View>
              <View style={styles.flex}>
                <ThemedText type="small" numberOfLines={2}>
                  {item.name}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {item.variant ? `${item.variant} · ` : ''}x{item.quantity}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <ThemedText type="smallBold">{tr.history}</ThemedText>
        <View style={[styles.timeline, { borderLeftColor: theme.border }]}>
          {[...order.history].reverse().map((h, i) => (
            <View key={`${h.status}-${h.at}`} style={styles.event}>
              <View style={[styles.dot, { backgroundColor: BrandGreen, opacity: i === 0 ? 1 : 0.6 }]}>
                <Icon name="check" size={12} color="#ffffff" strokeWidth={3} />
              </View>
              <ThemedText type="smallBold">{h.status === 'PENDING' ? a.timelinePlaced : a.orderStatus[h.status]}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {dateTime(h.at, locale)}
              </ThemedText>
            </View>
          ))}
        </View>
        <ThemedText type="caption" themeColor="textSecondary">
          {tr.updatedLive}
        </ThemedText>
      </Card>

      {customer && <Button label={tr.viewDetails} onPress={() => router.push({ pathname: '/orders/[number]', params: { number: order.number } })} />}
      <Button label={tr.another} variant="outline" onPress={onAnother} />
    </>
  );
}

function StatusBadge({ status, label }: { status: TrackedOrder['status']; label: string }) {
  const tone = ORDER_TONE[status];
  return (
    <View style={[styles.badge, { backgroundColor: tone.bg }]}>
      <ThemedText type="caption" style={[styles.bold, { color: tone.fg }]}>
        {label}
      </ThemedText>
    </View>
  );
}

function Row({ icon, label, value, selectable }: { icon: IconName; label: string; value: string; selectable?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Icon name={icon} size={16} color={theme.primary} />
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" selectable={selectable} style={styles.value}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.three, gap: Spacing.two + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  section: { gap: Spacing.two },
  badgeIcon: { width: 48, height: 48, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center' },
  mono: { letterSpacing: 1 },
  bold: { fontWeight: '700' },
  value: { flex: 1, textAlign: 'right' },
  badge: { borderRadius: Radius.full, paddingHorizontal: Spacing.two + 2, paddingVertical: 4, alignSelf: 'flex-start' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, padding: Spacing.two + 2 },
  pressed: { opacity: 0.85 },
  thumb: { width: 48, height: 48, borderRadius: Radius.md, overflow: 'hidden' },
  items: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two + 2, gap: Spacing.two },
  timeline: { borderLeftWidth: 2, marginLeft: 9, paddingLeft: Spacing.three + 2, gap: Spacing.three },
  event: { gap: 2 },
  dot: { position: 'absolute', left: -31, top: 0, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});

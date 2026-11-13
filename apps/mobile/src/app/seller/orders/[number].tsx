import { formatPhone, type ShopOrderAction } from '@talad/shared';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { OrderActionSheet, PRIMARY_ACTIONS } from '@/components/seller/order-action';
import { DepositReview, NotCollectedReport, Notice, ReplaceBill } from '@/components/seller/order-extras';
import { OrderStatusPill } from '@/components/seller/order-status';
import { PrivateImage } from '@/components/seller/private-image';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, LoadError, Loading } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { date, dateTime, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { sellerKeys, type ShopOrderDetail } from '@/lib/seller';
import { useSellerI18n } from '@/lib/seller-i18n';

/** `pack` is folded into shipping (older clients only). */
const HIDDEN: ShopOrderAction[] = ['pack'];

/**
 * One order, as the Seller Center shows it (§3.6): what to do next, deposit and bill notices,
 * items, the customer, payment, the money the shop gets, delivery and the timeline, with the
 * order's actions in a bar at the bottom.
 */
export default function SellerOrderScreen() {
  const { number = '' } = useLocalSearchParams<{ number: string }>();
  const theme = useTheme();
  const order = useQuery({
    queryKey: sellerKeys.order(number),
    queryFn: () => api<ShopOrderDetail>(`/me/shop/orders/${encodeURIComponent(number)}`),
  });
  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: number }} />
      {order.isPending && <Loading />}
      {order.isError && (
        <View style={styles.pad}>
          <LoadError onRetry={() => void order.refetch()} />
        </View>
      )}
      {order.data && <Detail order={order.data} refreshing={order.isRefetching} onRefresh={() => void order.refetch()} />}
    </View>
  );
}

function Detail({ order: o, refreshing, onRefresh }: { order: ShopOrderDetail; refreshing: boolean; onRefresh: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { s, locale } = useSellerI18n();
  const [action, setAction] = useState<ShopOrderAction | null>(null);
  const [viewBill, setViewBill] = useState(false);

  const actions = o.actions.filter((a) => !HIDDEN.includes(a)).sort((a, b) => Number(PRIMARY_ACTIONS.includes(b)) - Number(PRIMARY_ACTIONS.includes(a)));
  const primary = actions.filter((a) => PRIMARY_ACTIONS.includes(a));
  const secondary = actions.filter((a) => !PRIMARY_ACTIONS.includes(a));
  const label = (a: ShopOrderAction) => (a === 'ship' && o.pickup ? s.orders.readyForPickup : s.orders.actions[a]);
  // The shop's next step, above what already happened (a rejected return waits on MC Mart).
  const next =
    o.status === 'CONFIRMED' || o.status === 'PACKED'
      ? s.orders.next.ship
      : o.status === 'SHIPPED' || o.status === 'DELIVERED'
        ? s.orders.next.confirm
        : o.status === 'RETURN_REQUESTED' && !o.dispute
          ? s.orders.next.return
          : null;
  // A platform coupon is MC Mart's discount: it's paid back to the shop.
  const net = o.total + o.platformDiscount - o.commissionAmount;
  const address = o.shippingAddress;
  const phone = address?.phone ?? o.customer.phone;
  const showDelivery = o.deliveryProvider || o.trackingNumber || o.autoConfirmAt || o.hasShippingBill || o.urgentDelivery || o.pickup;

  const moreActions = () =>
    Alert.alert(s.orders.more, undefined, [
      ...secondary.map((a) => ({ text: label(a), style: 'destructive' as const, onPress: () => setAction(a) })),
      { text: s.common.cancel, style: 'cancel' as const },
    ]);

  return (
    <>
      <ScrollView
        contentContainerStyle={[styles.content, actions.length > 0 && { paddingBottom: 110 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
        <View style={styles.head}>
          <View style={styles.headRow}>
            <ThemedText type="subtitle" style={styles.mono} numberOfLines={1}>
              {o.number}
            </ThemedText>
            <OrderStatusPill status={o.status} />
          </View>
          <ThemedText type="caption" themeColor="textSecondary">
            {fill(s.orders.placed, { date: dateTime(o.createdAt, locale) })}
          </ThemedText>
        </View>

        {!!o.cancelReason && o.status === 'CANCELLED' && <Notice tone="muted">{fill(s.orders.cancelReason, { reason: o.cancelReason })}</Notice>}
        {o.dispute && <Notice tone="danger">{fill(s.orders.disputeOpen, { reason: s.orders.returnReasons[o.dispute.reason] ?? o.dispute.reason })}</Notice>}
        <DepositReview order={o} />
        {o.billIssueAt && o.billReplaceable && (
          <Notice>
            <View style={styles.gap}>
              <ThemedText type="small" style={styles.warnText}>
                {fill(s.orders.replaceBill.reported, { date: dateTime(o.billIssueAt, locale) })}
              </ThemedText>
              <ReplaceBill order={o} />
            </View>
          </Notice>
        )}
        {o.returnable && <NotCollectedReport number={o.number} />}

        <Card style={styles.card}>
          {o.items.map((i) => (
            <View key={i.sku} style={styles.item}>
              <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                {i.imageUrl ? <Image source={i.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="package" size={18} color={theme.textSecondary} />}
              </View>
              <View style={styles.flex}>
                <ThemedText type="small" numberOfLines={2}>
                  {i.name}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                  {[i.sku, i.variant].filter(Boolean).join(' · ')}
                </ThemedText>
              </View>
              <View style={styles.right}>
                <ThemedText type="caption" themeColor="textSecondary">
                  {money(i.unitPrice)} × {i.quantity}
                </ThemedText>
                <ThemedText type="smallBold">{money(i.lineTotal)}</ThemedText>
              </View>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <ThemedText type="smallBold">{s.orders.shipTo}</ThemedText>
          <Line icon="user" text={address?.recipientName ?? o.customer.name} />
          {phone && (
            <Pressable accessibilityRole="link" accessibilityLabel={s.orders.call} onPress={() => void Linking.openURL(`tel:${phone}`)}>
              <Line icon="phone" text={formatPhone(phone)} color={theme.primary} />
            </Pressable>
          )}
          {address && <Line icon="location" text={[address.line, address.village, address.district, address.province].filter(Boolean).join(', ')} />}
          {o.note && (
            <View style={[styles.noteBox, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="caption" themeColor="textSecondary">
                {s.orders.note}
              </ThemedText>
              <ThemedText type="small">{o.note}</ThemedText>
            </View>
          )}
        </Card>

        <Card style={styles.card}>
          <ThemedText type="smallBold">{s.orders.payment}</ThemedText>
          {o.payment && <Row label={s.orders.methods[o.payment.method]} value={s.orders.paymentStatus[o.payment.status]} />}
          {o.payment?.paidAt && (
            <ThemedText type="caption" themeColor="textSecondary">
              {fill(s.orders.paidAt, { date: dateTime(o.payment.paidAt, locale) })}
            </ThemedText>
          )}
          {o.deposit && (
            <>
              <Row label={s.orders.deposit.title} value={`${money(o.deposit.amount)} · ${s.orders.deposit.status[o.deposit.status]}`} />
              {(o.deposit.status === 'PENDING' || o.deposit.status === 'CONFIRMED') && <Row label={s.orders.deposit.rest} value={money(o.collectOnDelivery)} />}
            </>
          )}
          {o.status === 'PENDING' && o.paymentDueAt && (
            <ThemedText type="caption" themeColor="textSecondary">
              {fill(s.orders.payBy, { date: dateTime(o.paymentDueAt, locale) })}
            </ThemedText>
          )}
        </Card>

        <Card style={styles.card}>
          <ThemedText type="smallBold">{s.orders.summary}</ThemedText>
          <Row label={s.orders.subtotal} value={money(o.subtotal)} />
          {o.discountTotal > 0 && <Row label={s.orders.discount} value={`−${money(o.discountTotal)}`} />}
          {o.shippingFee > 0 && <Row label={s.orders.shipping} value={money(o.shippingFee)} />}
          <Row label={s.orders.total} value={money(o.total)} strong />
          <View style={[styles.rule, { backgroundColor: theme.border }]} />
          {o.platformDiscount > 0 && <Row label={s.orders.platformCoupon} value={`+${money(o.platformDiscount)}`} muted />}
          <Row label={s.orders.commission} value={`−${money(o.commissionAmount)}`} muted />
          <Row label={s.orders.youReceive} value={money(net)} strong />
        </Card>

        {showDelivery && (
          <Card style={styles.card}>
            <ThemedText type="smallBold">{s.orders.delivery}</ThemedText>
            {o.urgentDelivery && <Notice tone="danger">{fill(s.orders.urgentBody, { fee: money(o.shippingFee) })}</Notice>}
            {o.pickup && (
              <ThemedText type="small" themeColor="primary">
                {s.orders.pickupBody}
              </ThemedText>
            )}
            {o.deliveryProvider && <Row label={s.orders.courier} value={o.deliveryProvider.name} />}
            {o.trackingNumber && <Row label={s.orders.tracking} value={o.trackingNumber} />}
            {o.hasShippingBill && <Button label={s.orders.viewBill} icon="image" variant="outline" onPress={() => setViewBill(true)} />}
            {o.billReplaceable && !o.billIssueAt && <ReplaceBill order={o} />}
            {(o.status === 'SHIPPED' || o.status === 'DELIVERED') && o.autoConfirmAt && (
              <ThemedText type="caption" themeColor="textSecondary">
                {fill(s.orders.autoConfirm, { date: date(o.autoConfirmAt, locale) })}
              </ThemedText>
            )}
          </Card>
        )}

        <Card style={styles.card}>
          <ThemedText type="smallBold">{s.orders.timeline}</ThemedText>
          {next && (
            <View style={styles.step}>
              <View style={[styles.stepDot, { backgroundColor: '#f59e0b' }]}>
                <Icon name="clock" size={12} color="#ffffff" strokeWidth={3} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold" style={{ color: '#d97706' }}>
                  {next}
                </ThemedText>
                {(o.status === 'SHIPPED' || o.status === 'DELIVERED') && o.autoConfirmAt && (
                  <ThemedText type="caption" themeColor="textSecondary">
                    {fill(s.orders.autoConfirm, { date: date(o.autoConfirmAt, locale) })}
                  </ThemedText>
                )}
              </View>
            </View>
          )}
          {[...o.history].reverse().map((h, i) => (
            <View key={i} style={styles.step}>
              <View style={[styles.stepDot, { backgroundColor: theme.primary }]}>
                <Icon name="check" size={12} color="#ffffff" strokeWidth={3.5} />
              </View>
              <View style={styles.flex}>
                <ThemedText type="small">{h.status === 'PENDING' ? s.orders.placedStep : s.orders.status[h.status]}</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {dateTime(h.at, locale)} · {s.orders.actors[h.actor ?? 'SYSTEM']}
                </ThemedText>
                {h.note && (
                  <ThemedText type="caption" themeColor="textSecondary">
                    {s.orders.notes[h.note] ?? h.note}
                  </ThemedText>
                )}
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      {actions.length > 0 && (
        <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
          {secondary.length > 0 && (
            <Button
              label={secondary.length === 1 ? label(secondary[0]) : s.orders.more}
              variant="outline"
              onPress={() => (secondary.length === 1 ? setAction(secondary[0]) : moreActions())}
              style={styles.flex}
            />
          )}
          {primary.map((a) => (
            <Button key={a} label={label(a)} onPress={() => setAction(a)} style={styles.flex} />
          ))}
        </View>
      )}

      <OrderActionSheet order={o} action={action} onClose={() => setAction(null)} />
      <PrivateImage path={viewBill ? `/me/shop/orders/${encodeURIComponent(o.number)}/bill` : null} onClose={() => setViewBill(false)} />
    </>
  );
}

function Line({ icon, text, color }: { icon: 'user' | 'phone' | 'location'; text: string; color?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.line}>
      <Icon name={icon} size={16} color={color ?? theme.textSecondary} />
      <ThemedText type="small" style={[styles.flex, color ? { color } : null]}>
        {text}
      </ThemedText>
    </View>
  );
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <ThemedText type={strong ? 'smallBold' : 'small'} themeColor={muted ? 'textSecondary' : 'text'} style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText type={strong ? 'smallBold' : 'small'} themeColor={muted ? 'textSecondary' : 'text'} style={styles.value}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  gap: { gap: Spacing.two },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  head: { gap: 2 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  mono: { fontVariant: ['tabular-nums'], flexShrink: 1 },
  warnText: { color: '#78350f' },
  card: { padding: Spacing.three, gap: Spacing.two },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  thumb: { width: 52, height: 52, borderRadius: Radius.sm + 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  right: { alignItems: 'flex-end' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  noteBox: { borderRadius: Radius.md, padding: Spacing.two + 2, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  value: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.one },
  step: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

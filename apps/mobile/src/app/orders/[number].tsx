import { BILL_REPLACED_NOTE, billCorrectable, formatPhone, provinceName, SLIP_PAYMENT_METHODS } from '@talad/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Notice } from '@/components/order/notice';
import { DepositResend, OrderPayment } from '@/components/order/payment';
import { Progress } from '@/components/order/progress';
import { ReturnRequest } from '@/components/order/return-request';
import { ORDER_TONE } from '@/components/seller/order-status';
import { PrivateImage } from '@/components/seller/private-image';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { BrandGreen, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { date, dateTime, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { orderError, useOrderI18n } from '@/lib/order-i18n';
import { orderKey, orderPath, type OrderDetail } from '@/lib/orders';

/** System notes are stored in English; show them in the app's language when we know them. */
function noteText(note: string, notes: Record<string, string>): string {
  if (note.startsWith('Payment slip rejected: ')) return fill(notes.slipRejected ?? note, { reason: note.slice(23) });
  return notes[note] ?? note;
}

/**
 * One of the customer's orders, as the website's order page: what to do next (pay, confirm
 * receipt, send a new deposit slip, ask for a return), progress, items, timeline, delivery,
 * payment and the total. It refreshes every few seconds so the shop's updates show up.
 */
export default function OrderScreen() {
  const { number } = useLocalSearchParams<{ number: string }>();
  const theme = useTheme();
  const { o } = useOrderI18n();
  const order = useQuery({ queryKey: orderKey(number), queryFn: () => api<OrderDetail>(orderPath(number)), refetchInterval: 15_000 });

  return (
    <>
      <Stack.Screen options={{ title: number }} />
      {order.isPending && <Loading />}
      {order.isError &&
        (order.error instanceof ApiError && order.error.status === 404 ? (
          <View style={styles.pad}>
            <EmptyState icon="package" title={o.account.noOrders} />
          </View>
        ) : (
          <View style={styles.pad}>
            <LoadError onRetry={() => void order.refetch()} />
          </View>
        ))}
      {order.data && (
        <ScrollView
          style={{ backgroundColor: theme.background }}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={order.isRefetching} onRefresh={() => void order.refetch()} tintColor={theme.primary} />}>
          <Order order={order.data} />
        </ScrollView>
      )}
    </>
  );
}

function Order({ order }: { order: OrderDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { o, locale } = useOrderI18n();
  const a = o.account;
  const c = o.checkout;
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orderKey(order.number) });
    void queryClient.invalidateQueries({ queryKey: ['me', 'orders'] });
  };

  const payment = order.payment;
  const deposit = order.deposit;
  const returned = order.returnRequest;
  const address = order.shippingAddress;
  const first = order.items[0];
  const payable = order.status === 'PENDING' && payment?.status === 'PENDING' && SLIP_PAYMENT_METHODS.includes(payment.method) && order.transfer !== null;
  const billVersion = order.history.findLast((h) => h.note === BILL_REPLACED_NOTE)?.at;
  const billPath = `${orderPath(order.number)}/shipping-bill${billVersion ? `?v=${encodeURIComponent(billVersion)}` : ''}`;
  const period = (g: { duration: number; unit: keyof typeof a.guarantee.units }) => fill(a.guarantee.units[g.unit], { n: g.duration });

  const next =
    order.status === 'PENDING'
      ? order.paymentCheck === 'reviewing'
        ? a.timelineNext.reviewing
        : order.paymentCheck === 'rejected'
          ? a.timelineNext.rejected
          : a.timelineNext.payment
      : order.status === 'CONFIRMED' || order.status === 'PACKED'
        ? a.timelineNext.preparing
        : order.status === 'SHIPPED' || order.status === 'DELIVERED'
          ? order.pickup
            ? a.timelineNext.pickup
            : a.timelineNext.receive
          : order.status === 'RETURN_REQUESTED'
            ? a.timelineNext.return
            : null;
  const statusLabel = order.awaitingConfirmation
    ? c.verifying
    : order.paymentCheck === 'rejected'
      ? c.slipRejectedTitle
      : order.pickup && order.status === 'SHIPPED'
        ? a.stepReadyPickup
        : a.orderStatus[order.status];

  /** A yes/no question, then the request; the order reloads afterwards. */
  function confirm(key: string, question: string, yes: string, path: string, errorText: string) {
    Alert.alert(question, undefined, [
      { text: a.cancel, style: 'cancel' },
      {
        text: yes,
        onPress: () => {
          setBusy(key);
          void api(`${orderPath(order.number)}/${path}`, { method: 'POST' })
            .then(refresh)
            .catch((e: unknown) => Alert.alert(e instanceof ApiError && e.code ? orderError(o, e.code) : errorText))
            .finally(() => setBusy(null));
        },
      },
    ]);
  }

  async function chat() {
    setBusy('chat');
    try {
      const res = await api<{ id: string }>('/me/conversations', { method: 'POST', body: { shop: order.shop.slug } });
      router.push({ pathname: '/messages/[id]', params: { id: res.id, order: order.number } });
    } catch {
      Alert.alert(o.cartErrors.generic);
    } finally {
      setBusy(null);
    }
  }

  const tone = ORDER_TONE[order.status];
  return (
    <>
      {/* Number, date and status. */}
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="caption" themeColor="textSecondary">
              {a.orderNumber}
            </ThemedText>
            <ThemedText type="subtitle" selectable style={styles.mono}>
              {order.number}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {fill(a.placedOn, { date: dateTime(order.createdAt, locale) })}
            </ThemedText>
          </View>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <ThemedText type="caption" style={[styles.bold, { color: tone.fg }]}>
              {statusLabel}
            </ThemedText>
          </View>
        </View>
      </Card>

      {/* What to do now. */}
      {order.status === 'PENDING' && order.paymentDueAt && order.paymentCheck !== 'reviewing' && (
        <Notice tone="amber" icon="clock">
          {fill(a.payBefore, { date: dateTime(order.paymentDueAt, locale) })}
        </Notice>
      )}
      {payable && <OrderPayment order={order} onDone={refresh} />}
      {order.status === 'PENDING' && order.cancellable && order.paymentCheck === 'rejected' && (
        <Button
          label={a.cancelOrder}
          variant="outline"
          loading={busy === 'cancel'}
          onPress={() => confirm('cancel', a.cancelOrderConfirm, a.cancelOrderYes, 'cancel', a.cancelOrderError)}
        />
      )}
      {(order.status === 'SHIPPED' || order.status === 'DELIVERED') && (
        <Notice tone="green" icon="truck" title={a.receiveTitle}>
          {order.autoConfirmAt && (
            <ThemedText type="small" style={styles.green}>
              {fill(a.autoComplete, { date: date(order.autoConfirmAt, locale) })}
            </ThemedText>
          )}
          {order.pointsOnReceive > 0 && <Notice tone="amber">{fill(a.pointsWarning, { n: order.pointsOnReceive })}</Notice>}
          {order.noPoints && (
            <ThemedText type="caption" themeColor="textSecondary">
              {a.noPointsNote}
            </ThemedText>
          )}
          <Button label={a.receive} icon="check" loading={busy === 'receive'} onPress={() => confirm('receive', a.receiveConfirm, a.receiveYes, 'receive', a.receiveError)} />
        </Notice>
      )}
      {deposit?.status === 'PENDING' && (
        <Notice tone="amber" icon="clock" title={fill(a.deposit.pendingTitle, { amount: money(deposit.amount) })}>
          {deposit.dueAt ? fill(a.deposit.pendingBody, { date: dateTime(deposit.dueAt, locale) }) : undefined}
        </Notice>
      )}
      {deposit?.status === 'REJECTED' && (
        <>
          <Notice tone="orange" icon="alert" title={a.deposit.rejectedTitle}>
            {[deposit.rejectReason, deposit.dueAt && fill(a.deposit.rejectedBody, { date: dateTime(deposit.dueAt, locale) })].filter(Boolean).join('\n')}
          </Notice>
          {deposit.account && <DepositResend order={order} onDone={refresh} />}
        </>
      )}
      {deposit?.status === 'RETURN_DUE' && (
        <Notice tone="amber" icon="coins" title={fill(a.deposit.returnDueTitle, { amount: money(deposit.amount) })}>
          {fill(a.deposit.returnDueBody, { shop: order.shop.name })}
        </Notice>
      )}
      {deposit?.status === 'RETURNED' && (
        <Notice tone="grey" icon="coins" title={fill(a.deposit.returnedTitle, { amount: money(deposit.amount) })}>
          {a.deposit.returnedBody}
        </Notice>
      )}
      {deposit?.status === 'KEPT' && (
        <Notice tone="grey" icon="coins" title={fill(a.deposit.keptTitle, { amount: money(deposit.amount) })}>
          {a.deposit.keptBody}
        </Notice>
      )}
      {order.status === 'CANCELLED' && (
        <Notice tone="grey" icon="x" title={a.cancelledTitle}>
          {[
            order.cancelReason && noteText(order.cancelReason, a.timelineNotes),
            payment &&
              payment.method !== 'COD' &&
              (payment.status === 'PAID' || payment.refundedAt) &&
              (payment.refundedAt
                ? fill(c.refundDone, { amount: money(payment.amount), date: date(payment.refundedAt, locale) })
                : fill(c.refundPending, { amount: money(payment.amount) })),
          ]
            .filter(Boolean)
            .join('\n')}
        </Notice>
      )}
      {order.status === 'RETURN_REQUESTED' && (
        <Notice tone="orange" icon="swap" title={returned?.raisedBy === 'SHOP' ? a.returns.notCollectedTitle : a.refundTitle}>
          {returned?.raisedBy === 'SHOP'
            ? a.returns.notCollectedBody
            : `${returned ? `${(a.returns.reasons as Record<string, string>)[returned.reason] ?? returned.reason} · ` : ''}${a.refundBody}`}
        </Notice>
      )}
      {returned?.status === 'RESOLVED_REJECTED' && (
        <Notice tone="grey" icon="swap" title={a.returns.rejectedTitle}>
          {returned.resolution ?? undefined}
        </Notice>
      )}
      {order.returnable && (
        <ReturnRequest
          number={order.number}
          deadline={order.returnDeadline && date(order.returnDeadline, locale)}
          pointsNote={order.pointsEarned > 0 ? fill(a.returns.pointsNote, { n: order.pointsEarned.toLocaleString('en-US') }) : null}
          onDone={refresh}
        />
      )}

      {order.status !== 'CANCELLED' && (
        <Card style={styles.card}>
          <Progress
            status={order.status}
            labels={[a.stepPlaced, payment?.method === 'COD' ? a.stepConfirmed : a.stepPaid, order.pickup ? a.stepReadyPickup : a.stepShipped, a.stepCompleted]}
            waitingLabels={[a.stepPlaced, a.stepWaitingPayment, order.pickup ? a.stepWaitingPickup : a.stepWaitingShip, a.stepWaitingConfirm]}
          />
        </Card>
      )}

      {/* The shop and what was bought. */}
      <Card style={styles.flush}>
        <View style={[styles.shopRow, { borderBottomColor: theme.border }]}>
          <Icon name="shop" size={18} color={theme.primary} />
          <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
            {order.shop.name}
          </ThemedText>
          <Pressable
            accessibilityRole="button"
            disabled={busy === 'chat'}
            onPress={() => void chat()}
            style={[styles.chat, { borderColor: theme.primary }]}>
            <Icon name="chat" size={14} color={theme.primary} />
            <ThemedText type="caption" themeColor="primary" style={styles.bold}>
              {a.chatWithShop}
            </ThemedText>
          </Pressable>
        </View>
        {order.items.map((item, i) => (
          <Pressable
            key={item.sku}
            onPress={() => router.push(`/product/${order.shop.slug}/${item.productSlug}`)}
            style={[styles.item, i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
              {item.imageUrl && <Image source={item.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
            </View>
            <View style={styles.flex}>
              <ThemedText type="small" numberOfLines={2}>
                {item.name}
              </ThemedText>
              {item.variant && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {item.variant}
                </ThemedText>
              )}
              {item.guarantee && (
                <ThemedText type="caption" themeColor="primary" style={styles.bold}>
                  🛡 {fill(a.guarantee.label, { period: period(item.guarantee) })}
                </ThemedText>
              )}
              <View style={styles.row}>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.flex}>
                  {money(item.unitPrice)} x{item.quantity}
                </ThemedText>
                <ThemedText type="smallBold">{money(item.lineTotal)}</ThemedText>
              </View>
            </View>
          </Pressable>
        ))}
        {order.completedAt && order.items.some((i) => i.guarantee?.terms) && (
          <View style={[styles.terms, { borderTopColor: theme.border }]}>
            <ThemedText type="caption" themeColor="textSecondary">
              {a.guarantee.terms} · {a.guarantee.starts} {date(order.completedAt, locale)}
            </ThemedText>
            {order.items
              .filter((i) => i.guarantee?.terms)
              .map((i) => (
                <ThemedText key={i.sku} type="caption" themeColor="textSecondary">
                  • {i.name}: {i.guarantee!.terms}
                </ThemedText>
              ))}
          </View>
        )}
      </Card>

      {/* What happened, newest first, under what happens next. */}
      <Card style={styles.card}>
        <ThemedText type="smallBold">{a.timeline}</ThemedText>
        <View style={[styles.timeline, { borderLeftColor: theme.border }]}>
          {next && (
            <TimelineStep color="#f59e0b" icon="clock" title={next} titleColor="#b45309">
              {(order.status === 'SHIPPED' || order.status === 'DELIVERED') && order.autoConfirmAt ? fill(a.autoComplete, { date: date(order.autoConfirmAt, locale) }) : null}
            </TimelineStep>
          )}
          {[...order.history].reverse().map((h) => (
            <TimelineStep
              key={`${h.status}-${h.at}`}
              color={BrandGreen}
              icon="check"
              title={h.status === 'PENDING' ? a.timelinePlaced : h.status === 'CONFIRMED' && payment?.method === 'COD' ? a.stepConfirmed : a.orderStatus[h.status]}>
              {[dateTime(h.at, locale), h.note && `“${noteText(h.note, a.timelineNotes)}”`].filter(Boolean).join('\n')}
            </TimelineStep>
          ))}
        </View>
      </Card>

      {/* Delivery. */}
      <Card style={styles.card}>
        <SectionTitle icon="location">{a.shippingAddress}</SectionTitle>
        <ThemedText type="smallBold">{address.recipientName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatPhone(address.phone)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {[address.line, address.village, address.district, provinceName(address.province, locale)].filter(Boolean).join(', ')}
        </ThemedText>
        {(order.deliveryProvider || order.trackingNumber || order.hasShippingBill || order.urgentDelivery || order.pickup) && (
          <View style={[styles.split, { borderTopColor: theme.border }]}>
            {order.pickup && (
              <>
                <ThemedText type="smallBold" themeColor="primary">
                  🏪 {a.pickup}
                </ThemedText>
                {order.pickup.address && <Row label={a.pickupAt} value={order.pickup.address} />}
                <Row label={a.pickupCall} value={formatPhone(order.pickup.phone)} onPress={() => void Linking.openURL(`tel:${order.pickup!.phone}`)} />
                {order.pickup.latitude !== null && order.pickup.longitude !== null && (
                  <ThemedText
                    type="caption"
                    themeColor="primary"
                    style={styles.bold}
                    onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${order.pickup!.latitude},${order.pickup!.longitude}`)}>
                    📍 {a.openMap}
                  </ThemedText>
                )}
              </>
            )}
            {order.urgentDelivery && (
              <ThemedText type="smallBold" themeColor="sale">
                ⚡ {a.urgentDelivery}
              </ThemedText>
            )}
            {order.deliveryProvider && <Row label={a.carrier} value={order.deliveryProvider} />}
            {order.trackingNumber && <Row label={a.tracking} value={order.trackingNumber} selectable />}
            {order.hasShippingBill && <Button label={a.shippingBill} icon="receipt" variant="outline" onPress={() => setViewing(billPath)} />}
            {order.billReportable && (
              <ThemedText
                type="caption"
                themeColor="sale"
                style={styles.bold}
                onPress={() => confirm('bill', a.billReport.confirm, a.billReport.yes, 'shipping-bill/report', a.billReport.error)}>
                {a.billReport.action}
              </ThemedText>
            )}
            {order.hasShippingBill && <Notice tone="amber" icon="video">{a.unboxingVideo}</Notice>}
            {order.billIssueAt && billCorrectable(order.status) && <Notice tone="amber" icon="clock">{a.billReport.reported}</Notice>}
          </View>
        )}
      </Card>

      {payment && (
        <Card style={styles.card}>
          <SectionTitle icon="card">{a.paymentTitle}</SectionTitle>
          <View style={styles.row}>
            <ThemedText type="small" style={styles.flex}>
              {a.paymentMethod[payment.method]}
            </ThemedText>
            <ThemedText type="caption" themeColor={payment.status === 'PAID' ? 'primary' : payment.status === 'FAILED' ? 'sale' : 'textSecondary'} style={styles.bold}>
              {order.awaitingConfirmation ? c.verifying : a.paymentStatus[payment.status]}
            </ThemedText>
          </View>
          {payment.paidAt && (
            <ThemedText type="caption" themeColor="textSecondary">
              {fill(a.paidOn, { date: dateTime(payment.paidAt, locale) })}
            </ThemedText>
          )}
          {deposit && (
            <View style={[styles.split, { borderTopColor: theme.border }]}>
              <Row label={a.deposit.paid} value={money(deposit.amount)} />
              <ThemedText type="caption" themeColor="textSecondary" style={styles.right}>
                {a.deposit.status[deposit.status]}
              </ThemedText>
              {(deposit.status === 'PENDING' || deposit.status === 'CONFIRMED') && <Row label={a.deposit.rest} value={money(order.collectOnDelivery)} strong />}
              <ThemedText type="caption" themeColor="primary" style={styles.bold} onPress={() => setViewing(`${orderPath(order.number)}/deposit-slip`)}>
                {a.deposit.viewSlip}
              </ThemedText>
            </View>
          )}
        </Card>
      )}

      {order.note && (
        <Card style={styles.card}>
          <SectionTitle icon="comment">{c.noteTitle}</SectionTitle>
          <ThemedText type="small" themeColor="textSecondary">
            {order.note}
          </ThemedText>
        </Card>
      )}

      <Card style={styles.card}>
        <ThemedText type="smallBold">{a.summary}</ThemedText>
        <Row label={a.subtotal} value={money(order.subtotal)} />
        {order.shippingFee > 0 && <Row label={a.shippingFee} value={money(order.shippingFee)} />}
        {order.discountTotal > 0 && <Row label={a.discount} value={`-${money(order.discountTotal)}`} color={theme.sale} />}
        {order.pointsUsed > 0 && (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.right}>
            {fill(a.pointsUsedNote, { n: order.pointsUsed.toLocaleString('en-US') })}
          </ThemedText>
        )}
        <View style={[styles.row, styles.total, { borderTopColor: theme.border }]}>
          <ThemedText type="smallBold" style={styles.flex}>
            {a.total}
          </ThemedText>
          <ThemedText type="subtitle" themeColor="primary">
            {money(order.total)}
          </ThemedText>
        </View>
      </Card>

      {first && (order.status === 'COMPLETED' || order.status === 'CANCELLED') && (
        <Button label={a.buyAgain} icon="cart" onPress={() => router.push(`/product/${order.shop.slug}/${first.productSlug}`)} />
      )}

      <PrivateImage path={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

function TimelineStep({ color, icon, title, titleColor, children }: { color: string; icon: IconName; title: string; titleColor?: string; children?: ReactNode }) {
  return (
    <View style={styles.event}>
      <View style={[styles.dot, { backgroundColor: color }]}>
        <Icon name={icon} size={12} color="#ffffff" strokeWidth={3} />
      </View>
      <ThemedText type="smallBold" style={titleColor ? { color: titleColor } : undefined}>
        {title}
      </ThemedText>
      {!!children && (
        <ThemedText type="caption" themeColor="textSecondary">
          {children}
        </ThemedText>
      )}
    </View>
  );
}

function SectionTitle({ icon, children }: { icon: IconName; children: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <Icon name={icon} size={16} color={theme.primary} />
      <ThemedText type="smallBold">{children}</ThemedText>
    </View>
  );
}

function Row({ label, value, strong, color, selectable, onPress }: { label: string; value: string; strong?: boolean; color?: string; selectable?: boolean; onPress?: () => void }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
        {label}
      </ThemedText>
      <ThemedText
        type={strong ? 'smallBold' : 'small'}
        themeColor={onPress ? 'primary' : undefined}
        selectable={selectable}
        onPress={onPress}
        style={[styles.value, color ? { color } : undefined]}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.three, gap: Spacing.two },
  flush: { padding: 0, gap: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  mono: { letterSpacing: 1 },
  bold: { fontWeight: '700' },
  green: { color: '#1b5e20' },
  right: { textAlign: 'right' },
  value: { flexShrink: 1, textAlign: 'right' },
  badge: { borderRadius: Radius.full, paddingHorizontal: Spacing.two + 2, paddingVertical: 4, alignSelf: 'flex-start' },
  shopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  chat: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.full, paddingHorizontal: Spacing.two + 2, paddingVertical: 4 },
  item: { flexDirection: 'row', gap: Spacing.two + 2, padding: Spacing.three },
  thumb: { width: 64, height: 64, borderRadius: Radius.md, overflow: 'hidden' },
  terms: { borderTopWidth: StyleSheet.hairlineWidth, padding: Spacing.three, gap: 2 },
  timeline: { borderLeftWidth: 2, marginLeft: 9, paddingLeft: Spacing.three + 2, gap: Spacing.three },
  event: { gap: 2 },
  dot: { position: 'absolute', left: -31, top: 0, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2 },
  split: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, marginTop: Spacing.one, gap: Spacing.two },
  total: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, marginTop: Spacing.one },
});

import { LAO_BANKS, MAX_PAYMENT_SLIPS, type BankCode } from '@talad/shared';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { pickPhoto } from '@/components/seller/photo';
import { PrivateImage } from '@/components/seller/private-image';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { API_URL, ApiError, getApiToken } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';
import { orderError, useOrderI18n } from '@/lib/order-i18n';
import { orderPath, postFiles, type LocalFile, type OrderDetail, type PaymentSlip, type TransferAccount } from '@/lib/orders';

import { Notice } from './notice';

/** A photo from the API that needs the sign-in token (QR codes, slips). */
export function AuthImage({ path, style }: { path: string; style: object }) {
  const token = getApiToken();
  return <Image source={{ uri: `${API_URL}${path}`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={style} contentFit="contain" cachePolicy="none" />;
}

/** Camera or gallery, then the photo (smaller when big). */
export function useAskPhoto() {
  const { t } = useI18n();
  return () =>
    new Promise<LocalFile | null>((resolve) =>
      Alert.alert(t.msg.attach, undefined, [
        { text: t.msg.camera, onPress: () => void pickPhoto('camera', t.msg.cameraDenied).then(resolve) },
        { text: t.msg.gallery, onPress: () => void pickPhoto('gallery', t.msg.cameraDenied).then(resolve) },
        { text: t.msg.cancel, style: 'cancel', onPress: () => resolve(null) },
      ]),
    );
}

/** Where to transfer: the QR (private image), the amount and the bank account, as the website's payment panel. */
function TransferPanel({ title, body, qrPath, amount, transfer }: { title: string; body: string; qrPath: string | null; amount: number; transfer: TransferAccount }) {
  const theme = useTheme();
  const { o } = useOrderI18n();
  const c = o.checkout;
  const bank = transfer.bankCode && transfer.bankCode in LAO_BANKS ? LAO_BANKS[transfer.bankCode as BankCode] : transfer.bankCode;
  return (
    <View style={styles.panel}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <ThemedText type="caption" themeColor="textSecondary">
        {body}
      </ThemedText>
      {qrPath && (
        <View style={styles.qrWrap}>
          <AuthImage path={qrPath} style={styles.qr} />
          <ThemedText type="caption" themeColor="textSecondary">
            {c.saveQrHint}
          </ThemedText>
        </View>
      )}
      <View style={[styles.amount, { backgroundColor: theme.primarySoft }]}>
        <ThemedText type="caption" themeColor="textSecondary">
          {c.amountToPay}
        </ThemedText>
        <ThemedText type="subtitle" themeColor="primary">
          {money(amount)}
        </ThemedText>
      </View>
      {transfer.accountNumber && (
        <View style={[styles.account, { borderColor: theme.border }]}>
          {bank && (
            <ThemedText type="caption" themeColor="textSecondary">
              {bank}
            </ThemedText>
          )}
          {transfer.accountName && <ThemedText type="smallBold">{transfer.accountName}</ThemedText>}
          <ThemedText type="small" selectable style={styles.mono}>
            {transfer.accountNumber.replace(/(\d{4})(?=\d)/g, '$1 ')}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

/** Picked slips before sending: thumbnails with remove, and an add tile up to `max`. */
function SlipPicker({ picked, max, onAdd, onRemove }: { picked: LocalFile[]; max: number; onAdd: () => void; onRemove: (i: number) => void }) {
  const theme = useTheme();
  const { o } = useOrderI18n();
  return (
    <View style={styles.thumbs}>
      {picked.map((p, i) => (
        <View key={p.uri} style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
          <Image source={p.uri} style={StyleSheet.absoluteFill} contentFit="cover" />
          <Pressable accessibilityRole="button" accessibilityLabel={o.checkout.removeSlip} onPress={() => onRemove(i)} hitSlop={6} style={styles.remove}>
            <Icon name="x" size={14} color="#ffffff" />
          </Pressable>
        </View>
      ))}
      {picked.length < max && (
        <Pressable accessibilityRole="button" accessibilityLabel={o.checkout.addSlip} onPress={onAdd} style={[styles.thumb, styles.add, { borderColor: theme.primary }]}>
          <Icon name="add" size={22} color={theme.primary} />
          <ThemedText type="caption" themeColor="primary" style={styles.center}>
            {picked.length ? o.checkout.addSlip : o.checkout.chooseSlip}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

/** Slips already sent: tap one to see it large; with their check result when asked. */
function SentSlips({ number, slips, withStatus }: { number: string; slips: PaymentSlip[]; withStatus?: boolean }) {
  const theme = useTheme();
  const { o } = useOrderI18n();
  const [viewing, setViewing] = useState<string | null>(null);
  return (
    <>
      <View style={styles.thumbs}>
        {slips.map((s) => (
          <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={o.checkout.viewSlip} onPress={() => setViewing(s.id)} style={styles.sent}>
            <View style={[styles.thumb, { backgroundColor: '#ffffff', borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
              <AuthImage path={`${orderPath(number)}/payment-slips/${s.id}`} style={StyleSheet.absoluteFill} />
            </View>
            {withStatus && (
              <ThemedText type="caption" themeColor={s.status === 'REJECTED' ? 'sale' : s.status === 'APPROVED' ? 'primary' : 'textSecondary'} style={styles.bold}>
                {o.checkout.slipStatus[s.status]}
              </ThemedText>
            )}
          </Pressable>
        ))}
      </View>
      <PrivateImage path={viewing && `${orderPath(number)}/payment-slips/${viewing}`} onClose={() => setViewing(null)} />
    </>
  );
}

/**
 * Paying an order by transfer to MC Mart (as the website's OrderPayment): while slips are being
 * checked it shows them; with none yet, or after a rejection, the customer sends up to
 * MAX_PAYMENT_SLIPS new ones.
 */
export function OrderPayment({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const { o, locale } = useOrderI18n();
  const c = o.checkout;
  const askPhoto = useAskPhoto();
  const [picked, setPicked] = useState<LocalFile[]>([]);
  const [sending, setSending] = useState(false);
  const rejected = order.paymentCheck === 'rejected' ? order.slips.find((s) => s.status === 'REJECTED') : undefined;

  if (order.paymentCheck === 'reviewing') {
    const waiting = order.slips.filter((s) => s.status === 'PENDING');
    return (
      <Notice tone="sky" icon="check" title={c.verifying}>
        <ThemedText type="small" style={styles.sky}>
          {c.slipReceived}
        </ThemedText>
        {waiting[0] && (
          <ThemedText type="caption" style={styles.sky}>
            {fill(c.slipsSent, { date: dateTime(waiting[0].createdAt, locale) })}
          </ThemedText>
        )}
        <SentSlips number={order.number} slips={waiting} />
      </Notice>
    );
  }

  async function send() {
    setSending(true);
    try {
      await postFiles(`${orderPath(order.number)}/payment-slips`, 'files', picked);
      setPicked([]);
      onDone();
    } catch (e) {
      Alert.alert(orderError(o, e instanceof ApiError ? e.code : undefined));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {rejected && (
        <Notice tone="red" icon="alert" title={c.slipRejectedTitle}>
          {fill(c.slipRejectedBody, { reason: rejected.rejectReason ?? '—', n: MAX_PAYMENT_SLIPS })}
        </Notice>
      )}
      <Card style={styles.card}>
        <TransferPanel title={c.payVreview} body={c.scanBody} qrPath={order.transfer?.hasQr ? '/me/checkout/payment-qr' : null} amount={order.orderTotal} transfer={order.transfer!} />
        <ThemedText type="smallBold">{c.slipTitle}</ThemedText>
        <ThemedText type="caption" themeColor="textSecondary">
          {fill(c.slipsBody, { n: MAX_PAYMENT_SLIPS })}
        </ThemedText>
        <SlipPicker
          picked={picked}
          max={MAX_PAYMENT_SLIPS}
          onAdd={() => void askPhoto().then((f) => f && setPicked((list) => [...list, f]))}
          onRemove={(i) => setPicked((list) => list.filter((_, j) => j !== i))}
        />
        <Button label={sending ? c.sendingSlips : c.sendSlips} icon="send" loading={sending} disabled={!picked.length} onPress={() => void send()} />
        {order.slips.length > 0 && <SentSlips number={order.number} slips={order.slips} withStatus />}
      </Card>
    </>
  );
}

/** The shop rejected the deposit slip: pay it again to the shop's own account and send a new slip. */
export function DepositResend({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const { o } = useOrderI18n();
  const c = o.checkout;
  const askPhoto = useAskPhoto();
  const [slip, setSlip] = useState<LocalFile | null>(null);
  const [sending, setSending] = useState(false);
  const deposit = order.deposit!;

  async function send() {
    if (!slip) return;
    setSending(true);
    try {
      await postFiles(`${orderPath(order.number)}/deposit-slip`, 'file', [slip]);
      setSlip(null);
      onDone();
    } catch (e) {
      Alert.alert(orderError(o, e instanceof ApiError ? e.code : undefined));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card style={styles.card}>
      <TransferPanel
        title={fill(c.depositScanTitle, { shop: order.shop.name })}
        body={c.depositScanBody}
        qrPath={deposit.account?.hasQr ? `/me/checkout/shops/${encodeURIComponent(deposit.shopId)}/deposit-qr` : null}
        amount={deposit.amount}
        transfer={deposit.account!}
      />
      <ThemedText type="smallBold">{c.slipTitle}</ThemedText>
      <SlipPicker picked={slip ? [slip] : []} max={1} onAdd={() => void askPhoto().then((f) => f && setSlip(f))} onRemove={() => setSlip(null)} />
      <Button label={sending ? c.sendingSlips : c.sendSlips} icon="send" loading={sending} disabled={!slip} onPress={() => void send()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, gap: Spacing.two },
  panel: { gap: Spacing.two },
  qrWrap: { alignItems: 'center', gap: Spacing.one },
  qr: { width: 220, height: 220, borderRadius: Radius.md, backgroundColor: '#ffffff' },
  amount: { borderRadius: Radius.md, padding: Spacing.two, alignItems: 'center' },
  account: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two, gap: 2 },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 1 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: { width: 72, height: 92, borderRadius: Radius.sm, overflow: 'hidden' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 4 },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  sent: { alignItems: 'center', gap: 2 },
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  sky: { color: '#075985' },
});

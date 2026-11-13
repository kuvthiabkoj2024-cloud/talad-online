import type { ShopOrderAction } from '@talad/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Field, Input, Select } from '@/components/form';
import { pickPhoto, type PickedFile } from '@/components/seller/photo';
import { Sheet } from '@/components/seller/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, upload } from '@/lib/api';
import { money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { refreshOrders, useDeliveryProviders, type ShopOrderDetail } from '@/lib/seller';
import { sellerError, useSellerI18n } from '@/lib/seller-i18n';

/** Shown as the main (filled) button; the rest are outlined. */
export const PRIMARY_ACTIONS: ShopOrderAction[] = ['ship', 'approve-return'];
const NEEDS_REASON: ShopOrderAction[] = ['cancel', 'reject-return'];

/**
 * Confirms one order action, as the Seller Center's dialog: shipping takes a photo of the
 * courier's bill (not for urgent delivery or pickup) and the courier; cancelling and rejecting a
 * return need a reason for the customer.
 */
export function OrderActionSheet({ order, action, onClose }: { order: ShopOrderDetail; action: ShopOrderAction | null; onClose: () => void }) {
  const theme = useTheme();
  const { s } = useSellerI18n();
  const queryClient = useQueryClient();
  const providers = useDeliveryProviders();
  const [reason, setReason] = useState('');
  const [providerId, setProviderId] = useState(order.deliveryProvider?.id ?? '');
  const [tracking, setTracking] = useState('');
  const [bill, setBill] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const path = `/me/shop/orders/${encodeURIComponent(order.number)}`;
  const run = useMutation({
    mutationFn: async (a: ShopOrderAction) => {
      // Shipping uploads the courier's bill first, then ships with its key.
      const billKey = a === 'ship' && bill ? (await upload<{ billKey: string }>(`${path}/bill`, 'file', bill)).billKey : undefined;
      return api<ShopOrderDetail>(`${path}/actions`, {
        method: 'POST',
        body: {
          action: a,
          ...(reason.trim() && { reason: reason.trim() }),
          ...(a === 'ship' && providerId && { deliveryProviderId: providerId }),
          ...(a === 'ship' && tracking.trim() && { trackingNumber: tracking.trim() }),
          ...(billKey && { billKey }),
        },
      });
    },
    onSuccess: (saved) => {
      refreshOrders(queryClient, saved);
      close();
      Alert.alert(s.orders.done);
    },
    onError: (e) => setError(sellerError(s, e instanceof ApiError ? e.code : undefined)),
  });

  function close() {
    setReason('');
    setBill(null);
    setTracking('');
    setError(null);
    onClose();
  }

  async function choose(from: 'camera' | 'gallery') {
    const file = await pickPhoto(from, s.orders.cameraDenied);
    if (file) {
      setBill(file);
      setError(null);
    }
  }

  if (!action) return null;
  const needsReason = NEEDS_REASON.includes(action);
  const pickupReady = action === 'ship' && order.pickup;
  const title = pickupReady ? s.orders.readyForPickup : s.orders.actions[action];
  const paidTransfer = order.payment && order.payment.method !== 'COD' && order.payment.status === 'PAID';

  function submit() {
    if (!action) return;
    if (needsReason && !reason.trim()) return setError(s.orders.reasonRequired);
    if (action === 'ship' && !bill && !order.urgentDelivery && !order.pickup) return setError(s.orders.billRequired);
    run.mutate(action);
  }

  return (
    <Sheet visible title={title} onClose={close}>
      <ThemedText type="small" themeColor="textSecondary">
        {pickupReady ? s.orders.readyForPickupBody : s.orders.confirmBody[action]}
      </ThemedText>

      {/* Pickup has no parcel: no courier or bill to add. */}
      {action === 'ship' && !order.pickup && (
        <>
          <Field label={s.orders.bill} hint={s.orders.billHint}>
            {bill && <Image source={bill.uri} style={[styles.bill, { backgroundColor: theme.backgroundElement }]} contentFit="contain" />}
            <View style={styles.row}>
              <Button label={s.orders.takePhoto} icon="camera" variant="outline" onPress={() => void choose('camera')} style={styles.flex} />
              <Button label={s.orders.fromGallery} icon="image" variant="outline" onPress={() => void choose('gallery')} style={styles.flex} />
            </View>
          </Field>
          <Field label={s.orders.courier}>
            <Select
              value={providerId}
              placeholder={s.orders.chooseCourier}
              options={(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
              onChange={setProviderId}
            />
          </Field>
          <Field label={s.orders.trackingOptional}>
            <Input value={tracking} onChangeText={setTracking} autoCapitalize="characters" autoCorrect={false} maxLength={64} />
          </Field>
        </>
      )}

      {(action === 'out-of-stock' || action === 'cancel') && paidTransfer && (
        <View style={styles.note}>
          <ThemedText type="small" style={styles.noteText}>
            {fill(s.orders.refundNote, { amount: money(order.total) })}
          </ThemedText>
        </View>
      )}

      {(needsReason || action === 'approve-return') && (
        <Field label={needsReason ? s.orders.reason : `${s.orders.reason} (${s.orders.optional})`}>
          <Input value={reason} onChangeText={(v) => (setReason(v), setError(null))} multiline maxLength={300} style={styles.reason} />
        </Field>
      )}

      {error && (
        <ThemedText type="small" themeColor="sale">
          {error}
        </ThemedText>
      )}

      <View style={styles.row}>
        <Button label={s.common.cancel} variant="outline" onPress={close} style={styles.flex} />
        <Button label={title} loading={run.isPending} onPress={submit} style={[styles.flex, !PRIMARY_ACTIONS.includes(action) && { backgroundColor: theme.sale }]} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.two },
  bill: { width: '100%', height: 180, borderRadius: Radius.md },
  note: { backgroundColor: '#fffbeb', borderRadius: Radius.md, padding: Spacing.three },
  noteText: { color: '#78350f' },
  reason: { minHeight: 88, textAlignVertical: 'top', paddingTop: Spacing.two },
});

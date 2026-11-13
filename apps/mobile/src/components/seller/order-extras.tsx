import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Field, Input, Select } from '@/components/form';
import { Icon } from '@/components/icon';
import { pickPhoto, type PickedFile } from '@/components/seller/photo';
import { PrivateImage } from '@/components/seller/private-image';
import { Sheet } from '@/components/seller/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, upload } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { refreshOrders, useDeliveryProviders, type ShopOrderDetail } from '@/lib/seller';
import { sellerError, useSellerI18n } from '@/lib/seller-i18n';
import { shrinkPhoto } from '@/lib/shrink-photo';

const orderPath = (number: string) => `/me/shop/orders/${encodeURIComponent(number)}`;

/** An amber (or red) box with an icon: something the shop should know or do. */
export function Notice({ tone = 'warn', icon = 'alert', children }: { tone?: 'warn' | 'danger' | 'muted'; icon?: 'alert' | 'clock' | 'truck'; children: React.ReactNode }) {
  const theme = useTheme();
  const colors =
    tone === 'danger'
      ? { bg: '#fef2f2', border: '#fecaca', fg: '#991b1b' }
      : tone === 'muted'
        ? { bg: theme.backgroundElement, border: theme.border, fg: theme.textSecondary }
        : { bg: '#fffbeb', border: '#fde68a', fg: '#92400e' };
  return (
    <View style={[styles.notice, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Icon name={icon} size={18} color={colors.fg} />
      <View style={styles.flex}>{typeof children === 'string' ? <ThemedText type="small" style={{ color: colors.fg }}>{children}</ThemedText> : children}</View>
    </View>
  );
}

/**
 * The cash-on-delivery deposit the customer paid to the shop's own account: the shop checks the
 * slip and confirms or rejects it, or records sending it back when the order fell through.
 */
export function DepositReview({ order }: { order: ShopOrderDetail }) {
  const { s, locale } = useSellerI18n();
  const queryClient = useQueryClient();
  const [viewing, setViewing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deposit = order.deposit;
  const base = `${orderPath(order.number)}/deposit`;

  const run = useMutation({
    mutationFn: (step: { path: 'confirm' | 'returned' } | { path: 'reject'; reason: string }) =>
      api<ShopOrderDetail>(`${base}/${step.path}`, { method: 'POST', ...('reason' in step && { body: { reason: step.reason } }) }),
    onSuccess: (saved) => {
      refreshOrders(queryClient, saved);
      setRejecting(false);
      setReason('');
      Alert.alert(s.orders.deposit.done);
    },
    onError: (e) => {
      const message = sellerError(s, e instanceof ApiError ? e.code : undefined);
      if (rejecting) setError(message);
      else Alert.alert(message);
    },
  });

  if (!deposit || !['PENDING', 'REJECTED', 'RETURN_DUE'].includes(deposit.status)) return null;
  const c = s.orders.deposit;
  const amount = money(deposit.amount);
  const due = deposit.dueAt ? dateTime(deposit.dueAt, locale) : '';

  return (
    <Notice tone={deposit.status === 'REJECTED' ? 'muted' : 'warn'} icon="clock">
      <View style={styles.gap}>
        <ThemedText type="smallBold" style={styles.warnText}>
          {c.title} · {amount} · {c.status[deposit.status]}
        </ThemedText>
        <ThemedText type="small" style={styles.warnText}>
          {deposit.status === 'PENDING' && fill(c.checkBody, { amount, date: due })}
          {deposit.status === 'REJECTED' && fill(c.rejectedBody, { date: due })}
          {deposit.status === 'RETURN_DUE' && fill(c.returnBody, { amount })}
        </ThemedText>
        {deposit.status === 'PENDING' && (
          <>
            <Button label={c.viewSlip} icon="image" variant="outline" onPress={() => setViewing(true)} />
            <View style={styles.row}>
              <Button label={c.reject} variant="outline" onPress={() => setRejecting(true)} style={styles.flex} />
              <Button label={c.confirm} loading={run.isPending && !rejecting} onPress={() => run.mutate({ path: 'confirm' })} style={styles.flex} />
            </View>
          </>
        )}
        {deposit.status === 'RETURN_DUE' && <Button label={c.markReturned} loading={run.isPending} onPress={() => run.mutate({ path: 'returned' })} />}
      </View>
      <PrivateImage path={viewing ? `${base}/slip` : null} onClose={() => setViewing(false)} />
      <Sheet visible={rejecting} title={c.rejectTitle} onClose={() => (setRejecting(false), setError(null))}>
        <ThemedText type="small" themeColor="textSecondary">
          {c.rejectBody}
        </ThemedText>
        <Field label={c.reason}>
          <Input value={reason} onChangeText={(v) => (setReason(v), setError(null))} multiline maxLength={300} style={styles.multiline} />
        </Field>
        {error && (
          <ThemedText type="small" themeColor="sale">
            {error}
          </ThemedText>
        )}
        <Button
          label={c.reject}
          loading={run.isPending}
          onPress={() => (reason.trim() ? run.mutate({ path: 'reject', reason: reason.trim() }) : setError(s.orders.reasonRequired))}
        />
      </Sheet>
    </Notice>
  );
}

/** A new courier's bill for a parcel on its way (e.g. the customer said the first was wrong). */
export function ReplaceBill({ order }: { order: ShopOrderDetail }) {
  const theme = useTheme();
  const { s } = useSellerI18n();
  const queryClient = useQueryClient();
  const providers = useDeliveryProviders();
  const [open, setOpen] = useState(false);
  const [bill, setBill] = useState<PickedFile | null>(null);
  const [providerId, setProviderId] = useState(order.deliveryProvider?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const path = `${orderPath(order.number)}/bill`;

  const run = useMutation({
    mutationFn: async (file: PickedFile) => {
      const { billKey } = await upload<{ billKey: string }>(path, 'file', file);
      return api<ShopOrderDetail>(path, { method: 'PUT', body: { billKey, ...(providerId && { deliveryProviderId: providerId }) } });
    },
    onSuccess: (saved) => {
      refreshOrders(queryClient, saved);
      setOpen(false);
      setBill(null);
      Alert.alert(s.orders.replaceBill.done);
    },
    onError: (e) => setError(sellerError(s, e instanceof ApiError ? e.code : undefined)),
  });

  async function choose(from: 'camera' | 'gallery') {
    const file = await pickPhoto(from, s.orders.cameraDenied);
    if (file) setBill(file);
  }

  return (
    <>
      <Button label={s.orders.replaceBill.action} icon="camera" variant="outline" onPress={() => setOpen(true)} />
      <Sheet visible={open} title={s.orders.replaceBill.action} onClose={() => (setOpen(false), setError(null))}>
        <ThemedText type="small" themeColor="textSecondary">
          {s.orders.replaceBill.body}
        </ThemedText>
        {bill && <Image source={bill.uri} style={[styles.preview, { backgroundColor: theme.backgroundElement }]} contentFit="contain" />}
        <View style={styles.row}>
          <Button label={s.orders.takePhoto} icon="camera" variant="outline" onPress={() => void choose('camera')} style={styles.flex} />
          <Button label={s.orders.fromGallery} icon="image" variant="outline" onPress={() => void choose('gallery')} style={styles.flex} />
        </View>
        <Field label={s.orders.courier}>
          <Select value={providerId} placeholder={s.orders.chooseCourier} options={(providers.data ?? []).map((p) => ({ value: p.id, label: p.name }))} onChange={setProviderId} />
        </Field>
        {error && (
          <ThemedText type="small" themeColor="sale">
            {error}
          </ThemedText>
        )}
        <Button label={s.orders.replaceBill.send} loading={run.isPending} onPress={() => (bill ? run.mutate(bill) : setError(s.orders.billRequired))} />
      </Sheet>
    </>
  );
}

const MAX_EVIDENCE = 5;

/**
 * A cash-on-delivery order the customer never took: the shop sends photos or a video clip to
 * MC Mart. Once approved, the order is cancelled with no commission.
 */
export function NotCollectedReport({ number }: { number: string }) {
  const theme = useTheme();
  const { s } = useSellerI18n();
  const queryClient = useQueryClient();
  const c = s.orders.notCollected;
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<(PickedFile & { video: boolean; key?: string })[]>([]);
  const [details, setDetails] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const path = `${orderPath(number)}/return`;

  async function add() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(s.orders.cameraDenied);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_EVIDENCE - files.length,
      quality: 0.9,
    });
    if (res.canceled) return;
    const picked = await Promise.all(
      res.assets.map(async (a) => (a.type === 'video' ? { uri: a.uri, mimeType: a.mimeType ?? 'video/mp4', fileName: a.fileName ?? 'clip.mp4', video: true } : { ...(await shrinkPhoto(a)), video: false })),
    );
    setFiles((list) => [...list, ...picked].slice(0, MAX_EVIDENCE));
    setError(null);
  }

  const send = useMutation({
    mutationFn: async () => {
      const keys: string[] = [];
      for (const [i, f] of files.entries()) {
        setProgress(i);
        // Uploaded once: sending again after an error doesn't upload it twice.
        f.key ??= (await upload<{ key: string }>(`${path}/evidence`, 'file', f)).key;
        keys.push(f.key);
      }
      setProgress(files.length);
      await api(path, { method: 'POST', body: { details: details.trim() || undefined, evidenceKeys: keys } });
    },
    onSuccess: () => {
      refreshOrders(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['seller', 'order', number] });
      setOpen(false);
      setFiles([]);
      setDetails('');
      Alert.alert(c.sent);
    },
    onError: (e) => setError(sellerError(s, e instanceof ApiError ? e.code : undefined)),
    onSettled: () => setProgress(null),
  });

  return (
    <Notice tone="muted" icon="truck">
      <View style={styles.gap}>
        <ThemedText type="smallBold">{c.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {c.body}
        </ThemedText>
        <Button label={c.action} variant="outline" onPress={() => setOpen(true)} />
      </View>
      <Sheet visible={open} title={c.action} onClose={() => !send.isPending && (setOpen(false), setError(null))}>
        <Field label={c.files} hint={fill(c.filesHint, { files: MAX_EVIDENCE })}>
          <View style={styles.files}>
            {files.map((f, i) => (
              <View key={f.uri} style={[styles.file, { backgroundColor: theme.backgroundElement }]}>
                {f.video ? <Icon name="video" size={28} color={theme.textSecondary} /> : <Image source={f.uri} style={StyleSheet.absoluteFill} contentFit="cover" />}
                <Pressable accessibilityRole="button" onPress={() => setFiles((list) => list.filter((_, j) => j !== i))} style={styles.remove} hitSlop={6}>
                  <Icon name="x" size={14} color="#ffffff" />
                </Pressable>
              </View>
            ))}
            {files.length < MAX_EVIDENCE && (
              <Pressable accessibilityRole="button" onPress={() => void add()} style={[styles.file, styles.addFile, { borderColor: theme.border }]}>
                <Icon name="add" size={24} color={theme.primary} />
                <ThemedText type="caption" themeColor="primary">
                  {c.add}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </Field>
        <Field label={c.details}>
          <Input value={details} onChangeText={setDetails} multiline maxLength={1000} style={styles.multiline} />
        </Field>
        {error && (
          <ThemedText type="small" themeColor="sale">
            {error}
          </ThemedText>
        )}
        <Button
          label={progress !== null ? fill(c.uploading, { n: Math.min(progress + 1, files.length), total: files.length }) : c.send}
          loading={send.isPending}
          onPress={() => (files.length ? send.mutate() : setError(sellerError(s, 'EVIDENCE_REQUIRED')))}
        />
      </Sheet>
    </Notice>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two },
  warnText: { color: '#78350f' },
  notice: { flexDirection: 'row', gap: Spacing.two + 2, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three },
  multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: Spacing.two },
  preview: { width: '100%', height: 180, borderRadius: Radius.md },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  file: { width: 76, height: 76, borderRadius: Radius.sm + 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  addFile: { borderWidth: 1.5, borderStyle: 'dashed', gap: 2 },
  remove: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 3 },
});

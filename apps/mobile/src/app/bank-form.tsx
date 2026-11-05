import { Icon } from '@/components/icon';
import { useQueryClient } from '@tanstack/react-query';
import { BANK_CODES, LAO_BANKS, normalizeAccountNumber } from '@talad/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Field, Input, Select, Toggle } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, upload, type BankAccountItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { BANKS_KEY } from '@/lib/query-keys';

type Picked = ImagePicker.ImagePickerAsset;

/** Add or edit a refund bank account: bank, account name and number, and an optional receiving QR. */
export default function BankFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const existing = queryClient.getQueryData<BankAccountItem[]>(BANKS_KEY)?.find((b) => b.id === id);
  const [bankCode, setBankCode] = useState<string>(existing?.bankCode ?? '');
  const [accountName, setAccountName] = useState(existing?.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(existing?.accountNumber ?? '');
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  // New image to upload, "remove" to drop the current one, or unchanged.
  const [qr, setQr] = useState<Picked | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  const hasQr = qr ? qr !== 'remove' : !!existing?.hasQr;

  async function pickQr() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (!picked.canceled && picked.assets[0]) setQr(picked.assets[0]);
  }

  async function save() {
    const number = normalizeAccountNumber(accountNumber);
    if (!bankCode || !accountName.trim() || !accountNumber.trim()) return Alert.alert(t.acct.required);
    if (!number) return Alert.alert(t.acct.invalidAccountNumber);
    setBusy(true);
    try {
      let qrImageKey: string | null | undefined;
      if (qr && qr !== 'remove') qrImageKey = (await upload<{ qrImageKey: string }>('/me/bank-accounts/qr', 'file', qr)).qrImageKey;
      else if (qr === 'remove') qrImageKey = null;
      const body = { bankCode, accountName: accountName.trim(), accountNumber: number, isDefault, ...(qrImageKey !== undefined && { qrImageKey }) };
      await api(existing ? `/me/bank-accounts/${existing.id}` : '/me/bank-accounts', { method: existing ? 'PUT' : 'POST', body });
      await queryClient.invalidateQueries({ queryKey: BANKS_KEY });
      router.back();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: existing ? t.acct.editBank : t.acct.addBank }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Field label={t.acct.bank}>
            <Select value={bankCode} onChange={setBankCode} placeholder={t.acct.selectBank} options={BANK_CODES.map((c) => ({ value: c, label: LAO_BANKS[c] }))} />
          </Field>
          <Field label={t.acct.accountName}>
            <Input value={accountName} onChangeText={setAccountName} placeholder={t.acct.accountNamePlaceholder} autoCapitalize="characters" />
          </Field>
          <Field label={t.acct.accountNumber}>
            <Input value={accountNumber} onChangeText={setAccountNumber} placeholder={t.acct.accountNumberPlaceholder} keyboardType="number-pad" />
          </Field>
          <Toggle label={t.acct.setAsDefault} value={isDefault} onChange={setIsDefault} disabled={existing?.isDefault} />
        </Card>
        <Card style={styles.card}>
          <ThemedText type="smallBold">{t.acct.qrSection}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {t.acct.qrHelp}
          </ThemedText>
          {hasQr ? (
            <View style={styles.qrRow}>
              {qr && qr !== 'remove' ? (
                <Image source={qr.uri} style={[styles.qr, { borderColor: theme.border }]} contentFit="contain" />
              ) : (
                <View style={[styles.qr, styles.qrIcon, { borderColor: theme.border }]}>
                  <Icon name="qr" size={36} color={theme.primary} />
                </View>
              )}
              <View style={styles.qrActions}>
                <ThemedText type="caption" themeColor="primary">
                  ✓ {t.acct.qrAttached}
                </ThemedText>
                <View style={styles.inline}>
                  <Pill label={t.acct.changeQr} onPress={() => void pickQr()} />
                  <Pill label={t.acct.removeQr} onPress={() => setQr('remove')} />
                </View>
              </View>
            </View>
          ) : (
            <Button label={t.acct.uploadQr} icon="qr" variant="outline" onPress={() => void pickQr()} />
          )}
        </Card>
        <Button label={t.acct.save} loading={busy} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.three, gap: Spacing.three },
  qrRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  qr: { width: 96, height: 96, borderRadius: 12, borderWidth: 1 },
  qrIcon: { alignItems: 'center', justifyContent: 'center' },
  qrActions: { flex: 1, gap: Spacing.two },
  inline: { flexDirection: 'row', gap: Spacing.two },
});

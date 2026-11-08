import { useQueryClient } from '@tanstack/react-query';
import { normalizePhone, PROVINCE_CODES, provinceName } from '@talad/shared';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Field, Input, Select, Toggle } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, type AddressItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ADDRESSES_KEY } from '@/lib/query-keys';

/** Add or edit a delivery address: recipient, phone, branch address, province, district and village. */
export default function AddressFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const existing = queryClient.getQueryData<AddressItem[]>(ADDRESSES_KEY)?.find((a) => a.id === id);
  const [recipientName, setRecipientName] = useState(existing?.recipientName ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [line, setLine] = useState(existing?.line ?? '');
  const [province, setProvince] = useState(existing && (PROVINCE_CODES as string[]).includes(existing.province) ? existing.province : '');
  const [district, setDistrict] = useState(existing?.district ?? '');
  const [village, setVillage] = useState(existing?.village ?? '');
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [location, setLocation] = useState(existing?.location ?? null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Pins the address where the phone is (shops measure free-delivery distance from it). */
  async function locate() {
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return Alert.alert(t.acct.locateFailed);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const round = (n: number) => Math.round(n * 1e6) / 1e6;
      setLocation({ latitude: round(pos.coords.latitude), longitude: round(pos.coords.longitude) });
    } catch {
      Alert.alert(t.acct.locateFailed);
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    const e164 = normalizePhone(phone);
    if (!recipientName.trim() || !line.trim() || !province || !district.trim()) return Alert.alert(t.acct.required);
    if (!e164) return Alert.alert(t.login.invalidPhone);
    setBusy(true);
    try {
      const body = { recipientName: recipientName.trim(), phone: e164, line: line.trim(), province, district: district.trim(), village: village.trim(), isDefault, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null };
      await api(existing ? `/me/addresses/${existing.id}` : '/me/addresses', { method: existing ? 'PUT' : 'POST', body });
      await queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY });
      router.back();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.common.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: existing ? t.acct.editAddress : t.acct.addAddress }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Field label={t.acct.recipientName}>
            <Input value={recipientName} onChangeText={setRecipientName} placeholder={t.acct.recipientNamePlaceholder} autoComplete="name" />
          </Field>
          <Field label={t.acct.phone}>
            <Input value={phone} onChangeText={setPhone} placeholder="020 5555 1234" keyboardType="phone-pad" autoComplete="tel" />
          </Field>
        </Card>
        <Card style={styles.card}>
          <Field label={t.acct.addressLine}>
            <Input value={line} onChangeText={setLine} placeholder={t.acct.addressLinePlaceholder} multiline style={styles.multi} />
          </Field>
          <Field label={t.acct.province}>
            <Select value={province} onChange={setProvince} placeholder={t.acct.selectProvince} options={PROVINCE_CODES.map((c) => ({ value: c, label: provinceName(c, locale) }))} />
          </Field>
          <Field label={t.acct.district}>
            <Input value={district} onChangeText={setDistrict} placeholder={t.acct.districtPlaceholder} />
          </Field>
          <Field label={t.acct.village}>
            <Input value={village} onChangeText={setVillage} placeholder={t.acct.villagePlaceholder} />
          </Field>
          <Field label={t.acct.mapPin}>
            <View style={styles.pin}>
              {location ? (
                <ThemedText
                  type="small"
                  themeColor="primary"
                  onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${location.latitude},${location.longitude}`)}
                >
                  {t.acct.pinned.replace('{at}', `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`)}
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {t.acct.mapPinHint}
                </ThemedText>
              )}
              <Button label={t.acct.useCurrentLocation} variant="outline" icon="location" loading={locating} onPress={() => void locate()} />
              {location && <Button label={t.acct.removePin} variant="outline" icon="close" onPress={() => setLocation(null)} />}
            </View>
          </Field>
          {/* The only address is always the default. */}
          <Toggle label={t.acct.setAsDefault} value={isDefault} onChange={setIsDefault} disabled={existing?.isDefault} />
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
  pin: { gap: Spacing.two },
  multi: { minHeight: 72, paddingTop: 12, textAlignVertical: 'top' },
});

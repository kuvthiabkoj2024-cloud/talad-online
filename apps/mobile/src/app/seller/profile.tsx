import {
  BANK_CODES,
  LAO_BANKS,
  PROVINCE_CODES,
  provinceName,
  SHOP_PROFILE_RULES,
  SOCIAL_LINKS,
  WEEKDAYS,
  type BusinessHours,
  type SocialLink,
  type Weekday,
} from '@talad/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field, Input, Select } from '@/components/form';
import { Icon } from '@/components/icon';
import { PrivateImage } from '@/components/seller/private-image';
import { Sheet } from '@/components/seller/sheet';
import { sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, LoadError, Loading } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, upload } from '@/lib/api';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';
import { shrinkPhoto } from '@/lib/shrink-photo';

interface UrgentZone {
  province: string;
  districts: string[];
  fee: number;
}
interface ShopProfile {
  name: string;
  description: string | null;
  email: string | null;
  phone: string;
  address: string | null;
  location: { latitude: number; longitude: number } | null;
  logoUrl: string | null;
  coverUrl: string | null;
  businessHours: BusinessHours;
  socialLinks: Partial<Record<SocialLink, string>>;
  payment: { bankCode: string | null; accountName: string | null; accountNumber: string | null; hasQr: boolean };
  paymentWindowHrs: number;
  autoConfirmHrs: number;
  cod: { enabled: boolean; termsAcceptedAt: string | null };
  urgentDelivery: { enabled: boolean; eta: string; zones: UrgentZone[]; freeRadiusKm: number };
  pickupEnabled: boolean;
  deliveryProviders: { id: string; name: string; enabled: boolean }[];
}
type ZoneRow = { uid: string; province: string; districts: string; fee: string };
const uid = () => Math.random().toString(36).slice(2);

/** The shop's profile and settings (§3.2), as the Seller Center's "Shop profile". */
export default function SellerProfileScreen() {
  const theme = useTheme();
  const { s } = useSellerI18n();
  const profile = useQuery({ queryKey: ['seller', 'profile'], queryFn: () => api<ShopProfile>('/me/shop/profile') });
  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: s.profile.title }} />
      {profile.isPending ? (
        <Loading />
      ) : profile.isError ? (
        <View style={styles.pad}>
          <LoadError onRetry={() => void profile.refetch()} />
        </View>
      ) : (
        <ProfileForm profile={profile.data} onImage={() => void profile.refetch()} />
      )}
    </View>
  );
}

function ProfileForm({ profile: p, onImage }: { profile: ShopProfile; onImage: () => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { s, locale } = useSellerI18n();
  const t = s.profile;
  const [name, setName] = useState(p.name);
  const [about, setAbout] = useState(p.description ?? '');
  const [email, setEmail] = useState(p.email ?? '');
  const [phone, setPhone] = useState(p.phone);
  const [address, setAddress] = useState(p.address ?? '');
  const [location, setLocation] = useState(p.location);
  const [locating, setLocating] = useState(false);
  const [hours, setHours] = useState<BusinessHours>(p.businessHours ?? {});
  const [social, setSocial] = useState<Partial<Record<SocialLink, string>>>(p.socialLinks ?? {});
  const [bank, setBank] = useState(p.payment.bankCode ?? '');
  const [accountName, setAccountName] = useState(p.payment.accountName ?? '');
  const [accountNumber, setAccountNumber] = useState(p.payment.accountNumber ?? '');
  const [paymentWindow, setPaymentWindow] = useState(String(p.paymentWindowHrs));
  const [autoConfirm, setAutoConfirm] = useState(String(p.autoConfirmHrs));
  const [cod, setCod] = useState(p.cod.enabled);
  const [codTerms, setCodTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [pickup, setPickup] = useState(p.pickupEnabled);
  const [couriers, setCouriers] = useState(() => Object.fromEntries(p.deliveryProviders.map((d) => [d.id, d.enabled])));
  const [urgent, setUrgent] = useState(p.urgentDelivery?.enabled ?? false);
  const [eta, setEta] = useState(p.urgentDelivery?.eta ?? '');
  const [freeKm, setFreeKm] = useState(p.urgentDelivery?.freeRadiusKm ? String(p.urgentDelivery.freeRadiusKm) : '');
  const [zones, setZones] = useState<ZoneRow[]>(() => (p.urgentDelivery?.zones ?? []).map((z) => ({ uid: uid(), province: z.province, districts: z.districts.join(', '), fee: String(z.fee) })));
  const [viewQr, setViewQr] = useState(false);
  const [saving, setSaving] = useState(false);
  const rules = SHOP_PROFILE_RULES;

  async function uploadImage(kind: 'logo' | 'cover' | 'payment-qr') {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(s.orders.cameraDenied);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: kind === 'logo', aspect: kind === 'logo' ? [1, 1] : undefined });
    if (res.canceled || !res.assets[0]) return;
    try {
      await upload(`/me/shop/profile/${kind}`, 'file', await shrinkPhoto(res.assets[0], 1600));
      onImage();
    } catch {
      Alert.alert(s.common.saveError);
    }
  }

  async function removeImage(kind: 'logo' | 'cover' | 'payment-qr') {
    try {
      await api(`/me/shop/profile/${kind}`, { method: 'DELETE' });
      onImage();
    } catch {
      Alert.alert(s.common.saveError);
    }
  }

  async function locateShop() {
    setLocating(true);
    try {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted) return Alert.alert(s.location.locateFailed);
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      Alert.alert(s.location.locateFailed);
    } finally {
      setLocating(false);
    }
  }

  async function save() {
    const enablingCod = cod && !p.cod.termsAcceptedAt;
    if (enablingCod && !codTerms) return setShowTerms(true);
    setSaving(true);
    try {
      await api('/me/shop/profile', {
        method: 'PUT',
        body: {
          name: name.trim(),
          description: about.trim() || undefined,
          email: email.trim() || null,
          phone,
          address: address.trim(),
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
          businessHours: hours,
          socialLinks: Object.fromEntries(Object.entries(social).filter(([, v]) => v?.trim())),
          paymentBankCode: bank || null,
          paymentAccountName: accountName.trim() || null,
          paymentAccountNumber: accountNumber.trim() || null,
          paymentWindowHrs: Number(paymentWindow),
          autoConfirmHrs: Number(autoConfirm),
          codEnabled: cod,
          ...(enablingCod && { codTermsAccepted: true }),
          pickupEnabled: pickup,
          disabledDeliveryProviderIds: Object.entries(couriers)
            .filter(([, on]) => !on)
            .map(([id]) => id),
          urgentDelivery: {
            enabled: urgent,
            eta: eta.trim(),
            freeRadiusKm: freeKm.trim() ? Number(freeKm) : 0,
            zones: zones
              .filter((z) => z.province)
              .map((z) => ({ province: z.province, districts: z.districts.split(',').map((d) => d.trim()).filter(Boolean), fee: Number(z.fee) || 0 })),
          },
        },
      });
      void queryClient.invalidateQueries({ queryKey: ['seller'] });
      Alert.alert(t.saved);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      Alert.alert((code && (t.errors as Record<string, string>)[code]) || (e instanceof ApiError ? e.message : s.common.saveError));
    } finally {
      setSaving(false);
    }
  }

  const toggleRow = (label: string, hint: string | undefined, value: boolean, onChange: (v: boolean) => void) => (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {hint && (
          <ThemedText type="caption" themeColor="textSecondary">
            {hint}
          </ThemedText>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.primary }} />
    </View>
  );
  const imageRow = (label: string, url: string | null, kind: 'logo' | 'cover', round?: boolean) => (
    <View style={styles.imageRow}>
      <View style={[round ? styles.logo : styles.cover, { backgroundColor: theme.backgroundElement }]}>
        {url ? <Image source={url} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="image" size={22} color={theme.textSecondary} />}
      </View>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <View style={styles.row}>
          <Button label={url ? t.change : t.upload} variant="outline" onPress={() => void uploadImage(kind)} style={styles.small} />
          {url && <Button label={t.remove} variant="outline" onPress={() => void removeImage(kind)} style={styles.small} />}
        </View>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{t.images}</ThemedText>
          {imageRow(t.logo, p.logoUrl, 'logo', true)}
          {imageRow(t.cover, p.coverUrl, 'cover')}
          <ThemedText type="caption" themeColor="textSecondary">
            {t.imageHint}
          </ThemedText>
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{t.basics}</ThemedText>
          <Field label={t.name}>
            <Input value={name} onChangeText={setName} maxLength={80} />
          </Field>
          <Field label={t.about}>
            <Input value={about} onChangeText={setAbout} multiline maxLength={1000} style={styles.multiline} />
          </Field>
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{t.contact}</ThemedText>
          <Field label={t.phone}>
            <Input value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </Field>
          <Field label={t.email}>
            <Input value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </Field>
          <Field label={t.address} hint={t.addressHint}>
            <Input value={address} onChangeText={setAddress} multiline maxLength={300} style={styles.multiline} />
          </Field>
          <ThemedText type="smallBold">{s.location.title}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {location ? `📍 ${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : s.urgent.needsLocation}
          </ThemedText>
          <View style={styles.row}>
            <Button label={s.location.useCurrent} icon="location" variant="outline" loading={locating} onPress={() => void locateShop()} style={styles.flex} />
            {location && <Button label={s.location.remove} variant="outline" onPress={() => setLocation(null)} />}
          </View>
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{t.hours}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {t.hoursHint}
          </ThemedText>
          {WEEKDAYS.map((day: Weekday) => {
            const h = hours[day];
            return (
              <View key={day} style={styles.day}>
                <ThemedText type="small" style={styles.dayName}>
                  {t.days[day]}
                </ThemedText>
                <Switch
                  value={!!h}
                  onValueChange={(on) => setHours((all) => (on ? { ...all, [day]: { open: '08:00', close: '17:00' } } : Object.fromEntries(Object.entries(all).filter(([d]) => d !== day))))}
                  trackColor={{ true: theme.primary }}
                />
                {h ? (
                  <>
                    <Input value={h.open} onChangeText={(v) => setHours((all) => ({ ...all, [day]: { ...h, open: v } }))} keyboardType="numbers-and-punctuation" style={styles.time} />
                    <ThemedText type="small">–</ThemedText>
                    <Input value={h.close} onChangeText={(v) => setHours((all) => ({ ...all, [day]: { ...h, close: v } }))} keyboardType="numbers-and-punctuation" style={styles.time} />
                  </>
                ) : (
                  <ThemedText type="caption" themeColor="textSecondary" style={styles.flex}>
                    {t.closed}
                  </ThemedText>
                )}
              </View>
            );
          })}
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{t.social}</ThemedText>
          {SOCIAL_LINKS.map((k) => (
            <Field key={k} label={t.socialNames[k]}>
              <Input value={social[k] ?? ''} onChangeText={(v) => setSocial((all) => ({ ...all, [k]: v }))} autoCapitalize="none" autoCorrect={false} />
            </Field>
          ))}
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{t.payment}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {t.paymentHint}
          </ThemedText>
          <Field label={t.bank}>
            <Select value={bank} placeholder={t.chooseBank} options={BANK_CODES.map((b) => ({ value: b, label: LAO_BANKS[b] }))} onChange={setBank} />
          </Field>
          <Field label={t.accountName}>
            <Input value={accountName} onChangeText={setAccountName} />
          </Field>
          <Field label={t.accountNumber}>
            <Input value={accountNumber} onChangeText={setAccountNumber} keyboardType="number-pad" />
          </Field>
          <ThemedText type="smallBold">{t.qr}</ThemedText>
          <View style={styles.row}>
            <Button label={p.payment.hasQr ? t.change : t.upload} icon="qr" variant="outline" onPress={() => void uploadImage('payment-qr')} style={styles.flex} />
            {p.payment.hasQr && <Button label={s.register.view} variant="outline" onPress={() => setViewQr(true)} />}
            {p.payment.hasQr && (
              <Pressable accessibilityLabel={t.remove} onPress={() => void removeImage('payment-qr')} hitSlop={8}>
                <Icon name="trash" size={20} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{t.deadlines}</ThemedText>
          <Field label={t.paymentWindow} hint={fill(t.paymentWindowHint, rules.paymentWindowHrs)}>
            <Input value={paymentWindow} onChangeText={(v) => setPaymentWindow(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          </Field>
          <Field label={t.autoConfirm} hint={fill(t.autoConfirmHint, rules.autoConfirmHrs)}>
            <Input value={autoConfirm} onChangeText={(v) => setAutoConfirm(v.replace(/\D/g, ''))} keyboardType="number-pad" />
          </Field>
        </Card>

        <Card style={sellerStyles.card}>
          {toggleRow(s.cod.toggle, s.cod.description, cod, setCod)}
          <ThemedText type="caption" themeColor="primary" onPress={() => setShowTerms(true)}>
            {s.cod.readTerms} ›
          </ThemedText>
        </Card>

        <Card style={sellerStyles.card}>{toggleRow(s.pickup.toggle, s.pickup.description, pickup, setPickup)}</Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{s.couriers.title}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {s.couriers.description}
          </ThemedText>
          {p.deliveryProviders.map((d) => (
            <View key={d.id} style={styles.switchRow}>
              <ThemedText type="small" style={styles.flex}>
                {d.name}
              </ThemedText>
              <Switch value={couriers[d.id] ?? true} onValueChange={(on) => setCouriers((c) => ({ ...c, [d.id]: on }))} trackColor={{ true: theme.primary }} />
            </View>
          ))}
        </Card>

        <Card style={sellerStyles.card}>
          {toggleRow(s.urgent.toggle, s.urgent.description, urgent, setUrgent)}
          {urgent && (
            <>
              <Field label={s.urgent.eta} hint={s.urgent.etaHint}>
                <Input value={eta} onChangeText={setEta} placeholder={s.urgent.etaPlaceholder} />
              </Field>
              <Field label={s.urgent.freeRadius} hint={s.urgent.freeHint}>
                <Input value={freeKm} onChangeText={(v) => setFreeKm(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
              </Field>
              <ThemedText type="smallBold">{s.urgent.zones}</ThemedText>
              {zones.map((z) => (
                <View key={z.uid} style={[styles.zone, { borderColor: theme.border }]}>
                  <Select
                    value={z.province}
                    placeholder={s.urgent.province}
                    options={PROVINCE_CODES.map((c) => ({ value: c, label: provinceName(c, locale) }))}
                    onChange={(v) => setZones((l) => l.map((x) => (x.uid === z.uid ? { ...x, province: v } : x)))}
                  />
                  <Input value={z.districts} onChangeText={(v) => setZones((l) => l.map((x) => (x.uid === z.uid ? { ...x, districts: v } : x)))} placeholder={s.urgent.districtsPlaceholder} />
                  <View style={styles.row}>
                    <Input value={z.fee} onChangeText={(v) => setZones((l) => l.map((x) => (x.uid === z.uid ? { ...x, fee: v.replace(/\D/g, '') } : x)))} placeholder={s.urgent.fee} keyboardType="number-pad" style={styles.flex} />
                    <Pressable accessibilityLabel={s.urgent.removeZone} onPress={() => setZones((l) => l.filter((x) => x.uid !== z.uid))} hitSlop={8}>
                      <Icon name="trash" size={20} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                </View>
              ))}
              <Button label={s.urgent.addZone} icon="add" variant="outline" onPress={() => setZones((l) => [...l, { uid: uid(), province: 'VT', districts: '', fee: '' }])} style={styles.small} />
            </>
          )}
        </Card>
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
        <Button label={t.save} loading={saving} onPress={() => void save()} style={styles.flex} />
      </View>

      <Sheet visible={showTerms} title={s.cod.termsTitle} onClose={() => setShowTerms(false)}>
        <ThemedText type="small">{s.cod.termsIntro}</ThemedText>
        {(s.cod.terms as unknown as string[]).map((line, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary">
            {i + 1}. {line}
          </ThemedText>
        ))}
        {!p.cod.termsAcceptedAt && (
          <>
            {toggleRow(s.cod.accept, undefined, codTerms, setCodTerms)}
            <Button
              label={s.cod.confirm}
              disabled={!codTerms}
              onPress={() => {
                setShowTerms(false);
                setCod(true);
              }}
            />
          </>
        )}
      </Sheet>
      <PrivateImage path={viewQr ? '/me/shop/profile/payment-qr' : null} onClose={() => setViewQr(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.two },
  imageRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  logo: { width: 64, height: 64, borderRadius: 32, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  cover: { width: 96, height: 54, borderRadius: Radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 36, paddingHorizontal: Spacing.three },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  day: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dayName: { width: 64 },
  time: { flex: 1, textAlign: 'center' },
  zone: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two + 2, gap: Spacing.two },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
});

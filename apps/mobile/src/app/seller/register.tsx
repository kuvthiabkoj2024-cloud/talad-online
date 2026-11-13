import {
  formatPhone,
  KYC_DOCUMENT_TYPES,
  normalizePhone,
  REQUIRED_KYC_DOCUMENTS,
  SHOP_RULES,
  slugify,
  type KycDocumentType,
  type ShopStatus,
} from '@talad/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Redirect, Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { pickPhoto, type PickedFile } from '@/components/seller/photo';
import { PrivateImage } from '@/components/seller/private-image';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { BrandGreen, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, upload, type CustomerProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fill } from '@/lib/i18n';
import { sellerKeys } from '@/lib/seller';
import { useSellerI18n } from '@/lib/seller-i18n';

/** Mirrors `ShopApplication` (services/api shops). */
interface ShopApplication {
  status: ShopStatus;
  rejectionReason: string | null;
  name: string;
  slug: string;
  description: string | null;
  ownerName: string;
  email: string | null;
  phone: string;
  address: string | null;
  documents: { id: string; type: KycDocumentType; key: string }[];
}

/** A document in the form: saved (`id`), picked on this phone (`uri`), uploading (no `key` yet). */
interface Doc {
  key?: string;
  id?: string;
  uri?: string;
}

const EDITABLE: ShopStatus[] = ['PENDING', 'REJECTED'];
const APPLICATION_KEY = ['seller', 'application'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Open a shop (§3.1), in the app: shop details, contact, pickup address and the owner's ID.
 * The shop waits for MC Mart's review (PENDING); a pending or rejected application can be
 * corrected and sent again.
 */
export default function SellerRegisterScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { s, t } = useSellerI18n();
  const { customer } = useAuth();
  const existing = useQuery({ queryKey: APPLICATION_KEY, queryFn: () => api<ShopApplication>('/me/shop/application'), enabled: !!customer?.shop });

  if (!customer) {
    return (
      <View style={[styles.pad, styles.flex, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: s.register.title }} />
        <EmptyState icon="log-in" title={t.account.signIn} action={<Button label={t.account.signIn} onPress={() => router.push('/login')} style={styles.action} />} />
      </View>
    );
  }
  // Approved or suspended shops have nothing to apply for.
  if (customer.shop && !EDITABLE.includes(customer.shop.status as ShopStatus)) return <Redirect href="/seller" />;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: customer.shop ? s.register.editTitle : s.register.title }} />
      {customer.shop && existing.isPending ? (
        <Loading />
      ) : customer.shop && existing.isError ? (
        <View style={styles.pad}>
          <LoadError onRetry={() => void existing.refetch()} />
        </View>
      ) : (
        <ApplicationForm customer={customer} application={existing.data} />
      )}
    </View>
  );
}

function ApplicationForm({ customer, application }: { customer: CustomerProfile; application?: ShopApplication }) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { s } = useSellerI18n();
  const r = s.register;
  const { updateCustomer } = useAuth();
  const [name, setName] = useState(application?.name ?? '');
  const [slug, setSlug] = useState(application?.slug ?? '');
  const [slugEdited, setSlugEdited] = useState(!!application);
  const [description, setDescription] = useState(application?.description ?? '');
  const [ownerName, setOwnerName] = useState(application?.ownerName ?? customer.name);
  const [email, setEmail] = useState(application?.email ?? customer.email ?? '');
  const [phone, setPhone] = useState(formatPhone(application?.phone ?? customer.phone ?? '') || '');
  const [address, setAddress] = useState(application?.address ?? '');
  const [docs, setDocs] = useState<Partial<Record<KycDocumentType, Doc>>>(() =>
    Object.fromEntries((application?.documents ?? []).map((d) => [d.type, { key: d.key, id: d.id }])),
  );
  const [terms, setTerms] = useState(!!application);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [viewing, setViewing] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // The web address follows the name until edited (a Lao-only name gives nothing to follow).
  const effectiveSlug = slugEdited ? slug : slugify(name);
  const [checkedSlug, setCheckedSlug] = useState(effectiveSlug);
  useEffect(() => {
    const id = setTimeout(() => setCheckedSlug(effectiveSlug), 400);
    return () => clearTimeout(id);
  }, [effectiveSlug]);
  const slugValid = SHOP_RULES.slugPattern.test(checkedSlug);
  const slugCheck = useQuery({
    queryKey: ['seller', 'slug', checkedSlug],
    queryFn: () => api<{ available: boolean; valid: boolean }>(`/me/shop/application/slug?slug=${encodeURIComponent(checkedSlug)}`),
    enabled: slugValid,
  });

  const clear = (key: string) => setErrors((e) => (key in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));

  async function addDoc(type: KycDocumentType, from: 'camera' | 'gallery') {
    const file: PickedFile | null = await pickPhoto(from, s.orders.cameraDenied);
    if (!file) return;
    setDocs((d) => ({ ...d, [type]: { uri: file.uri } }));
    clear('documents');
    try {
      const res = await upload<{ key: string }>('/me/shop/application/documents', 'file', file);
      setDocs((d) => (d[type]?.uri === file.uri ? { ...d, [type]: { uri: file.uri, key: res.key } } : d));
    } catch (e) {
      setDocs((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== type)));
      Alert.alert(r.errors[(e instanceof ApiError && e.code) || ''] ?? s.common.saveError);
    }
  }

  const contactOk = ownerName.trim().length >= 2 && (!email.trim() || EMAIL.test(email.trim())) && !!normalizePhone(phone);
  const checks = [
    name.trim().length >= SHOP_RULES.nameMin && SHOP_RULES.slugPattern.test(effectiveSlug) && slugCheck.data?.available !== false,
    contactOk,
    address.trim().length >= 5,
    REQUIRED_KYC_DOCUMENTS.every((type) => !!docs[type]?.key),
    terms,
  ];
  const done = checks.filter(Boolean).length;

  async function submit() {
    const e: Record<string, string> = {};
    if (name.trim().length < SHOP_RULES.nameMin) e.name = r.errors.name;
    if (!SHOP_RULES.slugPattern.test(effectiveSlug) || slugCheck.data?.available === false) e.slug = r.errors.slug;
    if (ownerName.trim().length < 2) e.ownerName = r.errors.ownerName;
    if (email.trim() && !EMAIL.test(email.trim())) e.email = r.errors.email;
    if (!normalizePhone(phone)) e.phone = r.errors.phone;
    if (address.trim().length < 5) e.address = r.errors.address;
    if (!docs.NATIONAL_ID?.key) e.documents = r.errors.idRequired;
    else if (!docs.ID_SELFIE?.key) e.documents = r.errors.selfieRequired;
    if (!terms) e.terms = r.errors.terms;
    setErrors(e);
    if (Object.keys(e).length) return Alert.alert(Object.values(e)[0]);
    if (Object.values(docs).some((d) => d && !d.key)) return Alert.alert(r.uploading);

    setSubmitting(true);
    try {
      await api(`/me/shop/application`, {
        method: application ? 'PUT' : 'POST',
        body: {
          name: name.trim(),
          slug: effectiveSlug,
          description: description.trim() || undefined,
          ownerName: ownerName.trim(),
          email: email.trim() || null,
          phone,
          address: address.trim(),
          documents: KYC_DOCUMENT_TYPES.flatMap((type) => (docs[type]?.key ? [{ type, key: docs[type]!.key! }] : [])),
          acceptTerms: true,
        },
      });
      // The account now owns a (pending) shop: refresh it so "My shop" opens the seller home.
      updateCustomer(await api<CustomerProfile>('/auth/customer/me'));
      void queryClient.invalidateQueries({ queryKey: ['seller'] });
      queryClient.removeQueries({ queryKey: sellerKeys.shop });
      router.replace('/seller');
      Alert.alert(r.submitted);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'SLUG_TAKEN') setErrors({ slug: r.errors.SLUG_TAKEN });
      else if (code === 'EMAIL_TAKEN') setErrors({ email: r.errors.EMAIL_TAKEN });
      else if (code === 'PHONE_TAKEN' || code === 'INVALID_PHONE') setErrors({ phone: r.errors[code] });
      Alert.alert((code && r.errors[code]) || s.common.saveError);
    } finally {
      setSubmitting(false);
    }
  }

  const error = (key: string) =>
    errors[key] ? (
      <ThemedText type="caption" themeColor="sale">
        {errors[key]}
      </ThemedText>
    ) : null;
  const slugStatus = !effectiveSlug
    ? null
    : !SHOP_RULES.slugPattern.test(effectiveSlug)
      ? { text: r.slugInvalid, color: theme.sale }
      : checkedSlug !== effectiveSlug || slugCheck.isFetching
        ? { text: r.slugChecking, color: theme.textSecondary }
        : slugCheck.data?.available === false
          ? { text: r.slugTaken, color: theme.sale }
          : slugCheck.data
            ? { text: r.slugFree, color: theme.primary }
            : null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.hero, { backgroundColor: BrandGreen }]}>
          <ThemedText type="subtitle" style={styles.onBrand}>
            {application ? r.editTitle : r.title}
          </ThemedText>
          <ThemedText type="small" style={styles.onBrandSoft}>
            {r.subtitle}
          </ThemedText>
          <ThemedText type="caption" style={styles.onBrandSoft}>
            ✓ {r.free} · {fill(r.progress, { done, total: checks.length })}
          </ThemedText>
        </View>

        {application?.status === 'REJECTED' && (
          <Card style={[styles.notice, { borderColor: '#fecaca', backgroundColor: '#fef2f2' }]}>
            <ThemedText type="small" style={{ color: '#991b1b' }}>
              {fill(r.rejected, { reason: application.rejectionReason ?? '' })}
            </ThemedText>
          </Card>
        )}
        {application?.status === 'PENDING' && (
          <Card style={[styles.notice, { borderColor: '#fde68a', backgroundColor: '#fffbeb' }]}>
            <ThemedText type="small" style={{ color: '#92400e' }}>
              {r.pending}
            </ThemedText>
          </Card>
        )}

        <Card style={styles.card}>
          <ThemedText type="smallBold">{r.shopSection}</ThemedText>
          <Field label={r.shopName}>
            <Input value={name} onChangeText={(v) => (setName(v), clear('name'))} placeholder={r.shopNamePlaceholder} maxLength={SHOP_RULES.nameMax} />
            {error('name')}
          </Field>
          <Field label={r.slug} hint={r.slugHint}>
            <View style={[styles.slugRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <ThemedText type="small" themeColor="textSecondary">
                mcmart.app/s/
              </ThemedText>
              <Input
                value={effectiveSlug}
                onChangeText={(v) => {
                  setSlugEdited(true);
                  setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                  clear('slug');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={40}
                style={styles.slugInput}
              />
            </View>
            {slugStatus && (
              <ThemedText type="caption" style={{ color: slugStatus.color }}>
                {slugStatus.text}
              </ThemedText>
            )}
            {error('slug')}
          </Field>
          <Field label={r.description}>
            <Input
              value={description}
              onChangeText={setDescription}
              placeholder={r.descriptionPlaceholder}
              multiline
              maxLength={SHOP_RULES.descriptionMax}
              style={styles.multiline}
            />
          </Field>
        </Card>

        <Card style={styles.card}>
          <ThemedText type="smallBold">{r.contactSection}</ThemedText>
          <Field label={r.ownerName} hint={r.ownerNameHint}>
            <Input value={ownerName} onChangeText={(v) => (setOwnerName(v), clear('ownerName'))} autoComplete="name" maxLength={100} />
            {error('ownerName')}
          </Field>
          <Field label={r.phone}>
            <Input value={phone} onChangeText={(v) => (setPhone(v), clear('phone'))} keyboardType="phone-pad" placeholder="020 5555 1234" />
            {error('phone')}
          </Field>
          <Field label={r.email}>
            <Input value={email} onChangeText={(v) => (setEmail(v), clear('email'))} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
            {error('email')}
          </Field>
        </Card>

        <Card style={styles.card}>
          <ThemedText type="smallBold">{r.addressSection}</ThemedText>
          <Field label={r.address} hint={r.addressHint}>
            <Input value={address} onChangeText={(v) => (setAddress(v), clear('address'))} multiline maxLength={SHOP_RULES.addressMax} style={styles.multiline} />
            {error('address')}
          </Field>
        </Card>

        <Card style={styles.card}>
          <ThemedText type="smallBold">{r.docsSection}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {r.docsHint}
          </ThemedText>
          {KYC_DOCUMENT_TYPES.map((type) => {
            const doc = docs[type];
            const required = REQUIRED_KYC_DOCUMENTS.includes(type);
            return (
              <View key={type} style={[styles.doc, { borderColor: theme.border }]}>
                <View style={styles.docHead}>
                  <ThemedText type="small" style={styles.flex}>
                    {r.docTypes[type]}
                  </ThemedText>
                  {required && (
                    <ThemedText type="caption" themeColor="sale">
                      {r.required}
                    </ThemedText>
                  )}
                </View>
                {doc ? (
                  <View style={styles.docRow}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={r.view}
                      onPress={() => doc.id && !doc.uri && setViewing(`/me/shop/application/documents/${doc.id}`)}
                      style={[styles.docThumb, { backgroundColor: theme.backgroundElement }]}>
                      {doc.uri ? <Image source={doc.uri} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="done" size={22} color={theme.primary} />}
                    </Pressable>
                    <ThemedText type="caption" themeColor={doc.key ? 'primary' : 'textSecondary'} style={styles.flex}>
                      {doc.key ? `✓ ${r.uploaded}` : r.uploading}
                    </ThemedText>
                    {doc.id && !doc.uri && <Button label={r.view} variant="outline" onPress={() => setViewing(`/me/shop/application/documents/${doc.id}`)} style={styles.small} />}
                    <Button
                      label={r.remove}
                      variant="outline"
                      onPress={() => setDocs((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== type)))}
                      style={styles.small}
                    />
                  </View>
                ) : (
                  <View style={styles.docRow}>
                    <Button label={s.orders.takePhoto} icon="camera" variant="outline" onPress={() => void addDoc(type, 'camera')} style={styles.flex} />
                    <Button label={s.orders.fromGallery} icon="image" variant="outline" onPress={() => void addDoc(type, 'gallery')} style={styles.flex} />
                  </View>
                )}
              </View>
            );
          })}
          {error('documents')}
        </Card>

        <Card style={styles.card}>
          <View style={styles.terms}>
            <Switch value={terms} onValueChange={(v) => (setTerms(v), clear('terms'))} trackColor={{ true: theme.primary }} accessibilityLabel={r.terms} />
            <ThemedText type="small" style={styles.flex}>
              {r.terms}
            </ThemedText>
          </View>
          <Pressable accessibilityRole="link" onPress={() => router.push('/pages/terms')}>
            <ThemedText type="smallBold" themeColor="primary">
              {r.termsLink} ›
            </ThemedText>
          </Pressable>
          {error('terms')}
        </Card>

        <Button label={application ? r.resubmit : r.submit} loading={submitting} onPress={() => void submit()} />
      </ScrollView>
      <PrivateImage path={viewing} onClose={() => setViewing(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  action: { marginTop: Spacing.two, alignSelf: 'stretch' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  hero: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.one + 2 },
  onBrand: { color: '#ffffff' },
  onBrandSoft: { color: 'rgba(255,255,255,0.92)' },
  notice: { padding: Spacing.three },
  card: { padding: Spacing.three, gap: Spacing.three },
  slugRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.md, paddingLeft: Spacing.three },
  slugInput: { flex: 1, borderWidth: 0, paddingLeft: 2 },
  multiline: { minHeight: 88, textAlignVertical: 'top', paddingTop: Spacing.two },
  doc: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
  docHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  docThumb: { width: 52, height: 52, borderRadius: Radius.sm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 38, paddingHorizontal: Spacing.three },
  terms: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});

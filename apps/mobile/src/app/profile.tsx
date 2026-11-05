import { Icon } from '@/components/icon';
import { formatPhone } from '@talad/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { BrandGreen, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, avatarSrc, upload, type CustomerProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/** Edit profile, as on the website: photo, name and email. The sign-in phone number can't change here. */
export default function ProfileScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { customer, updateCustomer } = useAuth();
  const [name, setName] = useState(customer?.name ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [busy, setBusy] = useState<'save' | 'photo' | null>(null);
  if (!customer) return null;
  const photo = avatarSrc(customer);
  const initials = customer.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const fail = (e: unknown) => Alert.alert(e instanceof ApiError ? e.message : t.common.error);

  async function save() {
    if (!name.trim()) return Alert.alert(t.acct.required);
    setBusy('save');
    try {
      updateCustomer(await api<CustomerProfile>('/me/profile', { method: 'PUT', body: { name: name.trim(), email: email.trim() } }));
      Alert.alert(t.acct.saved);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function changePhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy('photo');
    try {
      updateCustomer(await upload<CustomerProfile>('/me/avatar', 'file', picked.assets[0]));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function removePhoto() {
    setBusy('photo');
    try {
      updateCustomer(await api<CustomerProfile>('/me/avatar', { method: 'DELETE' }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: t.acct.profile }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.photoCard}>
          <Pressable accessibilityRole="button" accessibilityLabel={t.acct.changePhoto} onPress={() => void changePhoto()} style={styles.avatar}>
            {photo ? <Image source={photo} style={StyleSheet.absoluteFill} contentFit="cover" /> : <ThemedText style={styles.initials}>{initials}</ThemedText>}
            <View style={[styles.camera, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Icon name="camera" size={16} color={theme.primary} />
            </View>
          </Pressable>
          <View style={styles.photoActions}>
            <ThemedText type="caption" themeColor="textSecondary">
              {fill(t.acct.memberSince, { date: date(customer.createdAt, locale) })}
            </ThemedText>
            <Button label={t.acct.changePhoto} variant="outline" icon="image" loading={busy === 'photo'} onPress={() => void changePhoto()} />
            {customer.avatarVersion && <Button label={t.acct.removePhoto} variant="outline" onPress={() => void removePhoto()} />}
          </View>
        </Card>

        <Card style={styles.card}>
          <Field label={t.acct.name}>
            <Input value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
          </Field>
          <Field label={t.acct.email}>
            <Input value={email} onChangeText={setEmail} placeholder={t.acct.emailPlaceholder} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          </Field>
          <Field label={t.acct.phone} hint={t.acct.phoneLocked}>
            <Input value={customer.phone ? formatPhone(customer.phone) : ''} editable={false} />
          </Field>
          <Button label={t.acct.save} loading={busy === 'save'} onPress={() => void save()} />
        </Card>

        <Card>
          <ThemedText type="smallBold" style={styles.methodsTitle}>
            {t.acct.signInMethods}
          </ThemedText>
          {[
            { label: t.acct.phone, on: customer.phone !== null, detail: customer.phone && formatPhone(customer.phone) },
            { label: 'Google', on: customer.linked.google, detail: null },
            { label: 'Apple', on: customer.linked.apple, detail: null },
          ].map((m) => (
            <View key={m.label} style={[styles.method, { borderTopColor: theme.border }]}>
              <View style={styles.flex}>
                <ThemedText type="small">{m.label}</ThemedText>
                {m.detail && (
                  <ThemedText type="caption" themeColor="textSecondary">
                    {m.detail}
                  </ThemedText>
                )}
              </View>
              {m.on ? (
                <View style={styles.connected}>
                  <Icon name="done" size={16} color={theme.primary} />
                  <ThemedText type="caption" themeColor="primary">
                    {t.acct.connected}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText type="caption" themeColor="textSecondary">
                  {t.acct.notConnected}
                </ThemedText>
              )}
            </View>
          ))}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  photoCard: { padding: Spacing.three, flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: BrandGreen, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#ffffff', fontSize: 28, lineHeight: 36, fontWeight: '800' },
  camera: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  photoActions: { flex: 1, gap: Spacing.two },
  card: { padding: Spacing.three, gap: Spacing.three },
  methodsTitle: { padding: Spacing.three, paddingBottom: Spacing.two },
  method: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderTopWidth: StyleSheet.hairlineWidth },
  connected: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});

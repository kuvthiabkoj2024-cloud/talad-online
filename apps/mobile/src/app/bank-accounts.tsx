import { Icon } from '@/components/icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LAO_BANKS, type BankCode } from '@talad/shared';
import { Stack, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { PrivateImage } from '@/components/seller/private-image';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, ApiError, getApiToken, type BankAccountItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { BANKS_KEY } from '@/lib/query-keys';

/** Bank accounts for refunds, as on the website: edit, delete and make default. */
export default function BankAccountsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  // The QR shown full screen (its API path), or null.
  const [viewing, setViewing] = useState<string | null>(null);
  const token = getApiToken();
  const banks = useQuery({ queryKey: BANKS_KEY, queryFn: () => api<BankAccountItem[]>('/me/bank-accounts') });

  const run = async (task: Promise<unknown>) => {
    try {
      await task;
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.common.error);
    }
    void queryClient.invalidateQueries({ queryKey: BANKS_KEY });
  };
  const remove = (b: BankAccountItem) =>
    Alert.alert(t.acct.deleteBankTitle, t.acct.deleteBody, [
      { text: t.acct.cancel, style: 'cancel' },
      { text: t.acct.delete, style: 'destructive', onPress: () => void run(api(`/me/bank-accounts/${b.id}`, { method: 'DELETE' })) },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: t.acct.bankAccounts }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={banks.isRefetching} onRefresh={() => void banks.refetch()} tintColor={theme.primary} />}>
        <ThemedText type="small" themeColor="textSecondary">
          {t.acct.bankAccountsDescription}
        </ThemedText>
        {banks.isPending && <Loading />}
        {banks.isError && <LoadError onRetry={() => void banks.refetch()} />}
        {banks.data && !banks.data.length && <EmptyState icon="card" title={t.acct.noBanks} body={t.acct.noBanksBody} />}
        {banks.data?.map((b) => (
          <Card key={b.id} style={[styles.card, b.isDefault && { borderColor: theme.primary, borderWidth: 1, backgroundColor: theme.primarySoft }]}>
            <View style={styles.head}>
              <Icon name="bank" size={18} color={theme.primary} />
              <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
                {LAO_BANKS[b.bankCode as BankCode] ?? b.bankCode}
              </ThemedText>
              {b.isDefault && <Pill tone="primary" label={t.acct.defaultBadge} />}
            </View>
            {/* Details and actions on the left, the refund QR on the right (tap to see it large). */}
            <View style={styles.body}>
              <View style={styles.details}>
                <ThemedText type="small">{b.accountName}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.mono}>
                  {b.accountNumber}
                </ThemedText>
                <View style={styles.actions}>
                  <Pill label={t.acct.edit} onPress={() => router.push({ pathname: '/bank-form', params: { id: b.id } })} />
                  {!b.isDefault && <Pill label={t.acct.makeDefault} onPress={() => void run(api(`/me/bank-accounts/${b.id}/default`, { method: 'POST' }))} />}
                  <Pill label={t.acct.delete} onPress={() => remove(b)} />
                </View>
              </View>
              {b.hasQr && (
                <Pressable
                  accessibilityRole="imagebutton"
                  accessibilityLabel={t.acct.qrAttached}
                  onPress={() => setViewing(`/me/bank-accounts/${b.id}/qr`)}
                  style={({ pressed }) => [styles.qr, { borderColor: theme.border }, pressed && styles.pressed]}>
                  <Image
                    source={{ uri: `${API_URL}/me/bank-accounts/${b.id}/qr`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
                    style={StyleSheet.absoluteFill}
                    contentFit="contain"
                    cachePolicy="none"
                  />
                  <View style={styles.zoom}>
                    <Icon name="search" size={12} color="#ffffff" />
                  </View>
                </Pressable>
              )}
            </View>
          </Card>
        ))}
        {!!banks.data?.length && (
          <ThemedText type="caption" themeColor="textSecondary">
            {t.acct.defaultRefundHint}
          </ThemedText>
        )}
        <Button label={t.acct.addBank} icon="add" onPress={() => router.push('/bank-form')} />
      </ScrollView>
      <PrivateImage path={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.three, gap: Spacing.one },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
  body: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  details: { flex: 1, gap: Spacing.one },
  qr: { width: 76, height: 76, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth, backgroundColor: '#ffffff', overflow: 'hidden' },
  zoom: { position: 'absolute', right: 3, bottom: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
});

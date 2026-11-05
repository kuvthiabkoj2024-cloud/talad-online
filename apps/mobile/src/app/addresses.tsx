import { Icon } from '@/components/icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatPhone, provinceName } from '@talad/shared';
import { Stack, useRouter } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, type AddressItem } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ADDRESSES_KEY } from '@/lib/query-keys';

/** Delivery addresses, as on the website: the default first, edit, delete and make default. */
export default function AddressesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const addresses = useQuery({ queryKey: ADDRESSES_KEY, queryFn: () => api<AddressItem[]>('/me/addresses') });

  const run = async (task: Promise<unknown>) => {
    try {
      await task;
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.common.error);
    }
    void queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY });
  };
  const remove = (a: AddressItem) =>
    Alert.alert(t.acct.deleteAddressTitle, t.acct.deleteBody, [
      { text: t.acct.cancel, style: 'cancel' },
      { text: t.acct.delete, style: 'destructive', onPress: () => void run(api(`/me/addresses/${a.id}`, { method: 'DELETE' })) },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: t.acct.addresses }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={addresses.isRefetching} onRefresh={() => void addresses.refetch()} tintColor={theme.primary} />}>
        <ThemedText type="small" themeColor="textSecondary">
          {t.acct.addressesDescription}
        </ThemedText>
        {addresses.isPending && <Loading />}
        {addresses.isError && <LoadError onRetry={() => void addresses.refetch()} />}
        {addresses.data && !addresses.data.length && <EmptyState icon="location" title={t.acct.noAddresses} body={t.acct.noAddressesBody} />}
        {addresses.data?.map((a) => (
          <Card key={a.id} style={[styles.card, a.isDefault && { borderColor: theme.primary, borderWidth: 1 }]}>
            <View style={styles.head}>
              <Icon name="location" size={18} color={theme.primary} />
              <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
                {a.recipientName}
              </ThemedText>
              {a.isDefault && <Pill tone="primary" label={t.acct.defaultBadge} />}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {formatPhone(a.phone)}
            </ThemedText>
            <ThemedText type="small">{[a.line, a.village, a.district, provinceName(a.province, locale)].filter(Boolean).join(', ')}</ThemedText>
            <View style={styles.actions}>
              <Pill label={t.acct.edit} onPress={() => router.push({ pathname: '/address-form', params: { id: a.id } })} />
              {!a.isDefault && <Pill label={t.acct.makeDefault} onPress={() => void run(api(`/me/addresses/${a.id}/default`, { method: 'POST' }))} />}
              <Pill label={t.acct.delete} onPress={() => remove(a)} />
            </View>
          </Card>
        ))}
        <Button label={t.acct.addAddress} icon="add" onPress={() => router.push('/address-form')} />
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.three, gap: Spacing.one },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.two },
});

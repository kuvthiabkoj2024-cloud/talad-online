import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Notice } from '@/components/order/notice';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, LoadError, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { pushPermission, registerPush } from '@/lib/push-notifications';

const KEY = ['me', 'notification-settings'];

/**
 * Profile → Notifications: promotions on or off (push and SMS; they still show in the inbox),
 * and whether this phone allows MC Mart's notifications, with a way to the phone's settings.
 */
export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const settings = useQuery({ queryKey: KEY, queryFn: () => api<{ promotions: boolean }>('/me/notification-settings') });
  const [phone, setPhone] = useState<'granted' | 'denied' | 'unavailable' | null>(null);

  useEffect(() => {
    void pushPermission().then(setPhone);
  }, []);

  async function setPromotions(on: boolean) {
    queryClient.setQueryData(KEY, { promotions: on });
    try {
      await api('/me/notification-settings', { method: 'PUT', body: { promotions: on } });
    } catch {
      void settings.refetch();
    }
  }

  async function turnOn() {
    // Asks the phone again when it still can; otherwise the phone's settings are the only way.
    await registerPush(locale).catch(() => {});
    const now = await pushPermission();
    setPhone(now);
    if (now !== 'granted') void Linking.openSettings();
  }

  return (
    <>
      <Stack.Screen options={{ title: t.notif.settings }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        {phone === 'granted' && (
          <Notice tone="green" icon="check">
            {t.notif.phoneOn}
          </Notice>
        )}
        {phone === 'denied' && (
          <Notice tone="amber" icon="alert" title={t.notif.phoneOff}>
            <ThemedText type="small" style={styles.amber}>
              {t.notif.phoneOffHint}
            </ThemedText>
            <Button label={t.notif.openSettings} onPress={() => void turnOn()} style={styles.button} />
          </Notice>
        )}

        {settings.isPending && <Loading />}
        {settings.isError && <LoadError onRetry={() => void settings.refetch()} />}
        {settings.data && (
          <Card style={styles.card}>
            <View style={styles.row}>
              <Icon name="megaphone" size={22} color={theme.primary} />
              <View style={styles.flex}>
                <ThemedText type="smallBold">{t.notif.promotions}</ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {t.notif.promotionsHint}
                </ThemedText>
              </View>
              <Switch value={settings.data.promotions} onValueChange={(v) => void setPromotions(v)} trackColor={{ true: theme.primary }} />
            </View>
            <View style={[styles.row, styles.divider, { borderTopColor: theme.border }]}>
              <Icon name="package" size={22} color={theme.textSecondary} />
              <ThemedText type="caption" themeColor="textSecondary" style={styles.flex}>
                {t.notif.always}
              </ThemedText>
            </View>
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  amber: { color: '#92400e' },
  button: { marginTop: Spacing.two, alignSelf: 'flex-start' },
});

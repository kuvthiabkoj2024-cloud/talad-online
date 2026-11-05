import { Icon } from '@/components/icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, SITE_URL, type FollowedShop } from '@/lib/api';
import { fill, useI18n } from '@/lib/i18n';

const KEY = ['me', 'follows'];

/** Shops I follow, as on the website. Opening a shop shows its page on the website for now. */
export default function FollowingScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const shops = useQuery({ queryKey: KEY, queryFn: () => api<FollowedShop[]>('/me/follows') });

  async function unfollow(id: string) {
    queryClient.setQueryData<FollowedShop[]>(KEY, (all) => all?.filter((s) => s.id !== id));
    await api(`/me/follows/${id}`, { method: 'DELETE' }).catch(() => {});
    void queryClient.invalidateQueries({ queryKey: KEY });
  }

  return (
    <>
      <Stack.Screen options={{ title: t.acct.following }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={shops.isRefetching} onRefresh={() => void shops.refetch()} tintColor={theme.primary} />}>
        {shops.isPending && <Loading />}
        {shops.isError && <LoadError onRetry={() => void shops.refetch()} />}
        {shops.data && !shops.data.length && <EmptyState icon="shop" title={t.acct.followedEmpty} body={t.acct.followedEmptyBody} />}
        {shops.data?.map((s) => (
          <Card key={s.id}>
            <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/${locale}/s/${s.slug}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.logo, { backgroundColor: theme.primarySoft }]}>
                {s.logoUrl ? <Image source={s.logoUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="shop" size={22} color={theme.primary} />}
              </View>
              <View style={styles.flex}>
                <View style={styles.inline}>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
                    {s.name}
                  </ThemedText>
                  {s.verified && <Icon name="verified" size={16} color={theme.primary} />}
                </View>
                <ThemedText type="caption" themeColor="textSecondary">
                  {fill(t.acct.followedProducts, { n: s.productCount })} · {fill(t.acct.followers, { n: s.followers })}
                </ThemedText>
              </View>
              <Pill label={t.acct.unfollow} onPress={() => void unfollow(s.id)} />
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  pressed: { opacity: 0.8 },
  logo: { width: 52, height: 52, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});

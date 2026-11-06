import { Icon } from '@/components/icon';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, type ConversationSummary } from '@/lib/api';
import { date } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/** Private chats with shops, newest first, with unread counts (as on the website). */
export default function MessagesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  const chats = useQuery({ queryKey: ['me', 'conversations'], queryFn: () => api<ConversationSummary[]>('/me/conversations'), refetchInterval: 15_000 });

  const preview = (c: ConversationSummary) => {
    const m = c.lastMessage;
    if (!m) return '';
    const what = m.text || (m.photo ? t.msg.photo : m.audio ? t.msg.voice : m.product ? t.msg.product : m.order ? t.msg.order : m.location ? t.msg.location : '');
    return m.mine ? `${t.msg.you}: ${what}` : what;
  };

  return (
    <>
      <Stack.Screen options={{ title: t.msg.title }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={chats.isRefetching} onRefresh={() => void chats.refetch()} tintColor={theme.primary} />}>
        {chats.isPending && <Loading />}
        {chats.isError && <LoadError onRetry={() => void chats.refetch()} />}
        {chats.data && !chats.data.length && <EmptyState icon="chats" title={t.msg.empty} body={t.msg.emptyHint} />}
        {!!chats.data?.length && (
          <Card>
            {chats.data.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(`/messages/${c.id}`)}
                style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.logo, { backgroundColor: theme.primarySoft }]}>
                  {c.shop.logoUrl ? <Image source={c.shop.logoUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="shop" size={22} color={theme.primary} />}
                </View>
                <View style={styles.flex}>
                  <View style={styles.inline}>
                    <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                      {c.shop.name}
                    </ThemedText>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {date(c.lastMessageAt, locale)}
                    </ThemedText>
                  </View>
                  <View style={styles.inline}>
                    <ThemedText type="small" themeColor={c.unread ? 'text' : 'textSecondary'} numberOfLines={1} style={[styles.flex, c.unread > 0 && styles.bold]}>
                      {preview(c)}
                    </ThemedText>
                    {c.unread > 0 && (
                      <View style={[styles.badge, { backgroundColor: theme.sale }]}>
                        <ThemedText style={styles.badgeText}>{c.unread > 99 ? '99+' : c.unread}</ThemedText>
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  logo: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { minWidth: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center' },
  badgeText: { color: '#ffffff', fontSize: 11, lineHeight: 20, fontWeight: '700' },
});

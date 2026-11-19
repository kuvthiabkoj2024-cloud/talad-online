import { Icon } from '@/components/icon';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { BrandGreen, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { chatBase, chatKeys, type ChatSide } from '@/components/chat/conversation';
import { api, type ConversationSummary } from '@/lib/api';
import { date } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

/** A chat in the list as either side sees it: customers see the shop, shops see the customer. */
type ChatSummary = Omit<ConversationSummary, 'shop'> & { shop?: ConversationSummary['shop']; customer?: { name: string } };

/**
 * Private chats, newest first, with unread counts: the customer's chats with shops (as on the
 * website), or a shop's chats with its customers (as in the Seller Center).
 */
export function ConversationList({ side }: { side: ChatSide }) {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  const chats = useQuery({ queryKey: chatKeys(side).list, queryFn: () => api<ChatSummary[]>(chatBase(side)), refetchInterval: 15_000 });

  const preview = (c: ChatSummary) => {
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
        {/* Customers: Market Chat (MC Mart's assistant) always first, even before any chat with it. */}
        {side === 'customer' && <MarketChatRow />}
        {chats.data && !chats.data.length && <EmptyState icon="chats" title={t.msg.empty} body={t.msg.emptyHint} />}
        {!!chats.data?.length && (
          <Card>
            {chats.data.map((c, i) => (
              <Pressable
                key={c.id}
                onPress={() => router.push(side === 'shop' ? `/seller/messages/${c.id}` : `/messages/${c.id}`)}
                style={({ pressed }) => [styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                <View style={[styles.logo, { backgroundColor: theme.primarySoft }]}>
                  {side === 'customer' && c.shop?.logoUrl ? (
                    <Image source={c.shop.logoUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : side === 'shop' ? (
                    <ThemedText type="smallBold" themeColor="primary">
                      {(c.customer?.name ?? '?').slice(0, 1).toUpperCase()}
                    </ThemedText>
                  ) : (
                    <Icon name="shop" size={22} color={theme.primary} />
                  )}
                </View>
                <View style={styles.flex}>
                  <View style={styles.inline}>
                    <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                      {side === 'shop' ? c.customer?.name : c.shop?.name}
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

/**
 * Market Chat, pinned above the shop chats: green, with MC Mart's logo, an "AI" tag and a pin, so
 * it reads as the platform's own assistant rather than a shop. Shows the last saved message, if any.
 */
function MarketChatRow() {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  const history = useQuery({
    queryKey: ['me', 'market-chat'],
    queryFn: () => api<{ role: 'user' | 'assistant'; text: string; image?: string; createdAt?: string }[]>('/chat/history'),
    staleTime: 30_000,
  });
  const last = history.data?.at(-1);
  const preview = last ? `${last.role === 'user' ? `${t.msg.you}: ` : ''}${last.text || (last.image ? t.msg.photo : '')}` : t.chat.pinnedHint;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t.chat.title}
      onPress={() => router.navigate('/chat')}
      style={({ pressed }) => [styles.pinned, { borderColor: BrandGreen, backgroundColor: theme.primarySoft }, pressed && styles.pressed]}>
      <LinearGradient colors={['#43a047', '#1b5e20']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.logo}>
        <Image source={require('@/assets/images/brand-logo.png')} style={styles.brand} contentFit="contain" />
      </LinearGradient>
      <View style={styles.flex}>
        <View style={styles.inline}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
            {t.chat.title}
          </ThemedText>
          <View style={[styles.aiTag, { backgroundColor: BrandGreen }]}>
            <ThemedText style={styles.aiText}>AI</ThemedText>
          </View>
          <View style={styles.flex} />
          {last?.createdAt ? (
            <ThemedText type="caption" themeColor="textSecondary">
              {date(last.createdAt, locale)}
            </ThemedText>
          ) : (
            <View style={styles.inline}>
              <Icon name="pin" size={13} color={theme.primary} />
              <ThemedText type="caption" themeColor="primary">
                {t.chat.pinned}
              </ThemedText>
            </View>
          )}
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {preview}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shrink: { flexShrink: 1 },
  pressed: { opacity: 0.8 },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 10, borderWidth: 1.5, borderRadius: Radius.lg },
  brand: { width: 28, height: 28 },
  aiTag: { borderRadius: Radius.full, paddingHorizontal: 6 },
  aiText: { color: '#ffffff', fontSize: 10, lineHeight: 16, fontWeight: '800' },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  // Compact rows (about 64 pt), like other chat apps.
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: 10 },
  logo: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  badge: { minWidth: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: 'center' },
  badgeText: { color: '#ffffff', fontSize: 11, lineHeight: 20, fontWeight: '700' },
});

import { Icon } from '@/components/icon';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { LoadError, Loading } from '@/components/ui';
import { BrandGreen, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, ApiError, getApiToken, SITE_URL, upload, type ChatProductRef, type ShopChatMessage, type ShopThread } from '@/lib/api';
import { money } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/**
 * One private chat with a shop, as on the website: text and photos both ways, the shop's
 * auto-replies and the products it shows. New messages are checked every few seconds.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const scroller = useRef<ScrollView>(null);
  const thread = useQuery({ queryKey: ['me', 'conversation', id], queryFn: () => api<ShopThread>(`/me/conversations/${id}`), refetchInterval: 4000 });

  // Opening the chat (and each new message while it's open) marks it read.
  const newest = thread.data?.messages.at(-1)?.id;
  useEffect(() => {
    if (!newest) return;
    void api(`/me/conversations/${id}/read`, { method: 'POST' })
      .then(() => queryClient.invalidateQueries({ queryKey: ['me', 'conversations'] }))
      .catch(() => {});
  }, [id, newest, queryClient]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['me', 'conversation', id] });

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api(`/me/conversations/${id}/messages`, { method: 'POST', body: { text: body } });
      setText('');
      await refresh();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.msg.error);
    } finally {
      setSending(false);
    }
  }

  async function sendPhoto() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (picked.canceled || !picked.assets[0]) return;
    setSending(true);
    try {
      await upload(`/me/conversations/${id}/messages`, 'photo', picked.assets[0], text.trim() ? { text: text.trim() } : {});
      setText('');
      await refresh();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.msg.error);
    } finally {
      setSending(false);
    }
  }

  const shop = thread.data?.shop;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: shop?.name ?? t.msg.title }} />
      {thread.isPending && <Loading />}
      {thread.isError && (
        <View style={styles.pad}>
          <LoadError onRetry={() => void thread.refetch()} />
        </View>
      )}
      {thread.data && (
        <ScrollView ref={scroller} contentContainerStyle={styles.thread} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
            🔒 {fill(t.msg.private, { shop: shop?.name ?? '' })}
          </ThemedText>
          {thread.data.messages.map((m) => (
            <Bubble key={m.id} m={m} conversationId={id} shopName={shop?.name ?? ''} locale={locale} />
          ))}
        </ScrollView>
      )}
      <View style={[styles.composer, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t.msg.attach} disabled={sending} onPress={() => void sendPhoto()} style={[styles.round, { backgroundColor: theme.backgroundElement }]}>
          <Icon name="camera" size={22} color={theme.textSecondary} />
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t.msg.placeholder}
          placeholderTextColor={theme.textSecondary}
          multiline
          style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.msg.send}
          disabled={!text.trim() || sending}
          onPress={() => void send()}
          style={[styles.round, { backgroundColor: text.trim() && !sending ? BrandGreen : theme.backgroundElement }]}>
          {sending ? <ActivityIndicator color={theme.primary} /> : <Icon name="send" size={20} color={text.trim() ? '#ffffff' : theme.textSecondary} />}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, conversationId, shopName, locale }: { m: ShopChatMessage; conversationId: string; shopName: string; locale: 'lo' | 'en' }) {
  const theme = useTheme();
  const { t } = useI18n();
  const token = getApiToken();

  if (m.system)
    return (
      <View style={[styles.system, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
          {m.text}
        </ThemedText>
      </View>
    );

  return (
    <View style={[styles.turn, m.mine ? styles.mineTurn : styles.theirTurn]}>
      {m.bot && (
        <ThemedText type="caption" themeColor="textSecondary">
          🤖 {t.msg.autoReply}
        </ThemedText>
      )}
      {m.hasPhoto && (
        <Image
          source={{ uri: `${API_URL}/me/conversations/${conversationId}/messages/${m.id}/photo`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
          style={[styles.photo, { backgroundColor: theme.backgroundElement }]}
          contentFit="cover"
        />
      )}
      {m.product && <ProductRef p={m.product} />}
      {m.audio && (
        <View style={[styles.bubble, m.mine ? { backgroundColor: BrandGreen } : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
          <ThemedText type="small" style={m.mine ? styles.white : undefined}>
            {t.msg.voice} · {Math.max(1, Math.round(m.audio.ms / 1000))}s
          </ThemedText>
        </View>
      )}
      {!!m.text && (
        <View style={[styles.bubble, m.mine ? { backgroundColor: BrandGreen, borderBottomRightRadius: 4 } : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 }]}>
          <ThemedText type="small" style={m.mine ? styles.white : undefined}>
            {m.text}
          </ThemedText>
        </View>
      )}
      {m.location && (
        <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${m.location!.lat},${m.location!.lng}`)}>
          <View style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText type="small" themeColor="primary">
              {t.msg.location}
            </ThemedText>
          </View>
        </Pressable>
      )}
      {m.order != null && (
        <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/${locale}/messages/${conversationId}`)}>
          <View style={[styles.bubble, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="small" themeColor="primary">
              {t.msg.orderCard}
            </ThemedText>
          </View>
        </Pressable>
      )}
      {m.products.map((p) => (
        <ProductRef key={p.id} p={p} />
      ))}
      <ThemedText type="caption" themeColor="textSecondary" accessibilityLabel={shopName}>
        {new Date(m.createdAt).toLocaleTimeString(locale === 'lo' ? 'lo-LA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
      </ThemedText>
    </View>
  );
}

/** A product shared in the chat: tap to open it. */
function ProductRef({ p }: { p: ChatProductRef }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/product/${p.shopSlug}/${p.slug}`)} style={[styles.product, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.productImg, { backgroundColor: theme.backgroundElement }]}>{p.imageUrl && <Image source={p.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}</View>
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={2}>
          {p.name}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="primary">
          {money(p.price)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  center: { textAlign: 'center' },
  white: { color: '#ffffff' },
  thread: { padding: Spacing.three, gap: Spacing.three },
  system: { alignSelf: 'center', borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, maxWidth: '90%' },
  turn: { gap: Spacing.one, maxWidth: '82%' },
  mineTurn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirTurn: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  photo: { width: 220, height: 220, borderRadius: Radius.md },
  product: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two, width: 240 },
  productImg: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: Spacing.three, paddingTop: 11, paddingBottom: 11, fontSize: 16, fontFamily: FontFamily.regular },
});

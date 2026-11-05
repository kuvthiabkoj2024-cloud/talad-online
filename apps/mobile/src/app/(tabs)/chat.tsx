import { Icon } from '@/components/icon';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProductCard } from '@/components/product-card';
import { ThemedText } from '@/components/themed-text';
import { Pill } from '@/components/ui';
import { BrandGreen, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, getApiToken, type ChatProduct } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  products?: ChatProduct[];
  suggestions?: string[];
  error?: boolean;
}

const GREETING = 'greeting';
let seq = 0;
const uid = () => `m${Date.now()}-${seq++}`;

/**
 * Market Chat, as on the website: ask in Lao or English and it answers with products from shops
 * across Laos. Signed in, the conversation is saved to the account (and shared with the website).
 */
export default function ChatScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const { customer } = useAuth();
  const greeting: Message = { id: GREETING, role: 'assistant', text: t.chat.greeting };
  const [messages, setMessages] = useState<Message[]>([greeting]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const scroller = useRef<ScrollView>(null);

  // Signed in: carry on the saved conversation.
  useEffect(() => {
    if (!customer) return;
    let live = true;
    void api<{ id: string; role: 'user' | 'assistant'; text: string; products?: ChatProduct[] }[]>('/chat/history')
      .then((rows) => live && rows.length && setMessages([{ id: GREETING, role: 'assistant', text: t.chat.greeting }, ...rows]))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [customer, t.chat.greeting]);

  async function send(message = text) {
    const body = message.trim();
    if (!body || pending) return;
    const history = messages
      .filter((m) => m.id !== GREETING && !m.error)
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { id: uid(), role: 'user', text: body }]);
    setText('');
    setPending(true);
    try {
      const form = new FormData();
      form.append('message', body);
      form.append('history', JSON.stringify(history));
      form.append('locale', locale);
      const token = getApiToken();
      const res = await fetch(`${API_URL}/chat`, { method: 'POST', body: form, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const data = await res.json().catch(() => ({}));
      setMessages((prev) => [
        ...prev,
        res.ok
          ? { id: uid(), role: 'assistant', text: data.reply, products: data.products, suggestions: data.suggestions }
          : { id: uid(), role: 'assistant', text: res.status === 429 ? t.chat.throttled : t.chat.error, error: true },
      ]);
    } catch {
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', text: t.chat.error, error: true }]);
    } finally {
      setPending(false);
    }
  }

  function newChat() {
    setMessages([greeting]);
    if (customer) void api('/chat/history', { method: 'DELETE' }).catch(() => {});
  }

  const last = messages.at(-1);
  const starting = messages.length === 1;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two, backgroundColor: theme.card, borderBottomColor: theme.border }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} hitSlop={8}>
          <Icon name="back" size={24} color={theme.text} />
        </Pressable>
        <View style={styles.botAvatar}>
          <Image source={require('@/assets/images/brand-logo.png')} style={styles.botLogo} contentFit="contain" />
        </View>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{t.chat.title}</ThemedText>
          <View style={styles.online}>
            <View style={styles.dot} />
            <ThemedText type="caption" themeColor="textSecondary">
              {t.chat.online}
            </ThemedText>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={t.chat.newChat} onPress={newChat} hitSlop={8}>
          <Icon name="edit" size={24} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView ref={scroller} contentContainerStyle={styles.thread} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        {messages.map((m) => (
          <View key={m.id} style={styles.turn}>
            <View
              style={[
                styles.bubble,
                m.role === 'user'
                  ? [styles.mine, { backgroundColor: BrandGreen }]
                  : [styles.theirs, { backgroundColor: theme.card, borderColor: m.error ? theme.sale : theme.border }],
              ]}>
              <ThemedText type="small" style={m.role === 'user' ? styles.mineText : m.error ? { color: theme.sale } : undefined}>
                {m.text}
              </ThemedText>
            </View>
            {!!m.products?.length && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.products}>
                {m.products.map((p) => (
                  <ProductCard key={p.id} product={p} width={150} />
                ))}
              </ScrollView>
            )}
          </View>
        ))}
        {pending && (
          <View style={[styles.bubble, styles.theirs, styles.typing, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <ThemedText type="caption" themeColor="textSecondary">
              {t.chat.typing}
            </ThemedText>
          </View>
        )}
        {!pending && (starting || (last?.role === 'assistant' && last.suggestions?.length)) && (
          <View style={styles.suggestions}>
            {starting && (
              <ThemedText type="caption" themeColor="textSecondary">
                {t.chat.tryAsking}
              </ThemedText>
            )}
            <View style={styles.chips}>
              {(starting ? t.chat.suggestions : last!.suggestions!).map((s) => (
                <Pill key={s} label={s} tone="primary" onPress={() => void send(s)} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.composer, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
        <View style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t.chat.placeholder}
            placeholderTextColor={theme.textSecondary}
            onSubmitEditing={() => void send()}
            returnKeyType="send"
            multiline
            style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t.chat.send}
            disabled={!text.trim() || pending}
            onPress={() => void send()}
            style={[styles.send, { backgroundColor: text.trim() && !pending ? BrandGreen : theme.backgroundElement }]}>
            <Icon name="send" size={20} color={text.trim() && !pending ? '#ffffff' : theme.textSecondary} />
          </Pressable>
        </View>
        <ThemedText type="caption" themeColor="textSecondary" style={styles.disclaimer}>
          {t.chat.disclaimer}
        </ThemedText>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two + 2, borderBottomWidth: StyleSheet.hairlineWidth },
  botAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: BrandGreen, alignItems: 'center', justifyContent: 'center' },
  botLogo: { width: 30, height: 30 },
  online: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22c55e' },
  thread: { padding: Spacing.three, gap: Spacing.three },
  turn: { gap: Spacing.two },
  bubble: { maxWidth: '85%', borderRadius: Radius.lg + 2, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: Spacing.one },
  theirs: { alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: Spacing.one },
  mineText: { color: '#ffffff' },
  typing: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  products: { gap: Spacing.two + 2, paddingRight: Spacing.three },
  suggestions: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.one },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  // 16px text: phones (and the web build) don't zoom in when it's tapped.
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderWidth: 1, borderRadius: 23, paddingHorizontal: Spacing.three, paddingTop: 12, paddingBottom: 12, fontSize: 16, fontFamily: FontFamily.regular },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  disclaimer: { textAlign: 'center' },
});

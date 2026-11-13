import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/seller/sheet';
import { SellerScroll, sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { BrandGreen, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { money } from '@/lib/format';
import { fill } from '@/lib/i18n';
import { useSellerI18n } from '@/lib/seller-i18n';

interface ShopFaq {
  id: string;
  question: string;
  answer: string;
}
interface ChatbotOverview {
  engine: 'ai' | 'basic';
  knows: { products: number; hours: boolean; address: boolean; transfer: boolean; description: boolean };
  faqs: ShopFaq[];
}
interface Preview {
  text: string;
  topic: string;
  handoff: boolean;
  silent?: boolean;
  order: boolean;
  products: { id: string; name: string; price: number }[];
}
type Turn = { role: 'user' | 'assistant'; text: string; meta?: string };

/** The shop's chat bot (§3.5): what it knows, its FAQ answers, and a test chat. */
export default function SellerChatbotScreen() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { s } = useSellerI18n();
  const b = s.chatbot;
  const overview = useQuery({ queryKey: ['seller', 'chatbot'], queryFn: () => api<ChatbotOverview>('/me/shop/chatbot') });
  const [editing, setEditing] = useState<ShopFaq | 'new' | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [chat, setChat] = useState<Turn[]>([]);
  const [asking, setAsking] = useState(false);
  const d = overview.data;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['seller', 'chatbot'] });

  function open(faq: ShopFaq | 'new') {
    setQuestion(faq === 'new' ? '' : faq.question);
    setAnswer(faq === 'new' ? '' : faq.answer);
    setEditing(faq);
  }

  async function save() {
    if (!question.trim() || !answer.trim()) return Alert.alert(b.errors.FAQ_REQUIRED);
    setSaving(true);
    try {
      const body = { question: question.trim(), answer: answer.trim() };
      if (editing === 'new') await api('/me/shop/chatbot/faqs', { method: 'POST', body });
      else if (editing) await api(`/me/shop/chatbot/faqs/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      void refresh();
      Alert.alert(b.saved);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      Alert.alert((code && (b.errors as Record<string, string>)[code]) || b.errors.generic);
    } finally {
      setSaving(false);
    }
  }

  function remove(faq: ShopFaq) {
    Alert.alert(b.deleteTitle, b.deleteBody, [
      { text: b.cancel, style: 'cancel' },
      {
        text: b.delete,
        style: 'destructive',
        onPress: () =>
          void api(`/me/shop/chatbot/faqs/${faq.id}`, { method: 'DELETE' })
            .then(() => (refresh(), Alert.alert(b.deleted)))
            .catch(() => Alert.alert(b.errors.generic)),
      },
    ]);
  }

  async function ask() {
    const text = message.trim();
    if (!text || asking) return;
    setMessage('');
    const history = chat.map(({ role, text: t }) => ({ role, text: t }));
    setChat((c) => [...c, { role: 'user', text }]);
    setAsking(true);
    try {
      const r = await api<Preview>('/me/shop/chatbot/preview', { method: 'POST', body: { message: text, history } });
      const topic = (b.topics as Record<string, string>)[r.topic] ?? r.topic;
      const meta = [fill(b.understood, { topic }), r.handoff ? b.handoff : '', r.order ? b.orderCard : '', ...r.products.map((p) => `🛍 ${p.name} · ${money(p.price)}`)].filter(Boolean).join('\n');
      setChat((c) => [...c, { role: 'assistant', text: r.silent ? b.silent : r.text, meta }]);
    } catch {
      setChat((c) => [...c, { role: 'assistant', text: b.errors.generic }]);
    } finally {
      setAsking(false);
    }
  }

  const knows: [string, boolean][] = d
    ? [
        [fill(b.products, { n: d.knows.products }), d.knows.products > 0],
        [b.hours, d.knows.hours],
        [b.address, d.knows.address],
        [b.transfer, d.knows.transfer],
        [b.about, d.knows.description],
        [fill(b.faqCount, { n: d.faqs.length }), d.faqs.length > 0],
      ]
    : [];

  return (
    <>
      <Stack.Screen options={{ title: b.title }} />
      <SellerScroll loading={overview.isPending} error={overview.isError} refreshing={overview.isRefetching} onRefresh={() => void overview.refetch()}>
        {d && (
          <>
            <Card style={[sellerStyles.card, { backgroundColor: theme.primarySoft }]}>
              <ThemedText type="smallBold" themeColor="primary">
                🤖 {b.on} · {d.engine === 'ai' ? b.engineAi : b.engineBasic}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {b.description}
              </ThemedText>
            </Card>

            <Card style={sellerStyles.card}>
              <ThemedText type="smallBold">{b.knowsTitle}</ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {b.knowsBody}
              </ThemedText>
              {knows.map(([label, ok]) => (
                <View key={label} style={styles.know}>
                  <Icon name={ok ? 'check' : 'x'} size={16} color={ok ? theme.primary : theme.sale} />
                  <ThemedText type="small" style={styles.flex}>
                    {label}
                  </ThemedText>
                  {!ok && (
                    <ThemedText type="caption" themeColor="sale">
                      {b.missing}
                    </ThemedText>
                  )}
                </View>
              ))}
            </Card>

            <Card style={sellerStyles.card}>
              <View style={styles.head}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {b.faqTitle}
                </ThemedText>
                <Button label={b.addFaq} icon="add" variant="outline" onPress={() => open('new')} style={styles.small} />
              </View>
              <ThemedText type="caption" themeColor="textSecondary">
                {b.faqBody}
              </ThemedText>
              {!d.faqs.length && (
                <ThemedText type="small" themeColor="textSecondary">
                  {b.emptyFaq}
                </ThemedText>
              )}
              {d.faqs.map((f) => (
                <View key={f.id} style={[styles.faq, { borderColor: theme.border }]}>
                  <Pressable accessibilityRole="button" onPress={() => open(f)} style={styles.flex}>
                    <ThemedText type="smallBold">❓ {f.question}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {f.answer}
                    </ThemedText>
                  </Pressable>
                  <Pressable accessibilityLabel={b.delete} onPress={() => remove(f)} hitSlop={8}>
                    <Icon name="trash" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
              ))}
            </Card>

            <Card style={sellerStyles.card}>
              <View style={styles.head}>
                <ThemedText type="smallBold" style={styles.flex}>
                  {b.tryTitle}
                </ThemedText>
                {chat.length > 0 && (
                  <ThemedText type="caption" themeColor="primary" onPress={() => setChat([])}>
                    {b.reset}
                  </ThemedText>
                )}
              </View>
              <ThemedText type="caption" themeColor="textSecondary">
                {b.tryBody}
              </ThemedText>
              {!chat.length && (
                <ThemedText type="small" themeColor="textSecondary">
                  {b.tryEmpty}
                </ThemedText>
              )}
              {chat.map((turn, i) => (
                <View key={i} style={[styles.bubble, turn.role === 'user' ? [styles.mine, { backgroundColor: BrandGreen }] : { backgroundColor: theme.backgroundElement }]}>
                  {turn.role === 'assistant' && (
                    <ThemedText type="caption" themeColor="textSecondary">
                      🤖 {b.autoReply}
                    </ThemedText>
                  )}
                  <ThemedText type="small" style={turn.role === 'user' ? styles.white : undefined}>
                    {turn.text}
                  </ThemedText>
                  {turn.meta && (
                    <ThemedText type="caption" themeColor="textSecondary">
                      {turn.meta}
                    </ThemedText>
                  )}
                </View>
              ))}
              <View style={styles.head}>
                <Input value={message} onChangeText={setMessage} placeholder={b.tryPlaceholder} onSubmitEditing={() => void ask()} returnKeyType="send" style={styles.flex} />
                <Button label={b.send} loading={asking} onPress={() => void ask()} style={styles.small} />
              </View>
            </Card>
          </>
        )}
      </SellerScroll>

      <Sheet visible={!!editing} title={editing === 'new' ? b.addFaq : b.editFaq} onClose={() => setEditing(null)}>
        <Field label={b.question} hint={b.questionHint}>
          <Input value={question} onChangeText={setQuestion} placeholder={b.questionPlaceholder} multiline maxLength={300} />
        </Field>
        <Field label={b.answer}>
          <Input value={answer} onChangeText={setAnswer} placeholder={b.answerPlaceholder} multiline maxLength={1000} style={styles.multiline} />
        </Field>
        <Button label={b.save} loading={saving} onPress={() => void save()} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  white: { color: '#ffffff' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  small: { minHeight: 40, paddingHorizontal: Spacing.three },
  know: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  faq: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
  bubble: { borderRadius: Radius.lg, padding: Spacing.two + 2, maxWidth: '88%', gap: 2, alignSelf: 'flex-start' },
  mine: { alignSelf: 'flex-end' },
  multiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: Spacing.two },
});

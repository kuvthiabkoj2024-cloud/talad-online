import type { Locale } from '@talad/shared';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { date } from '@/lib/format';
import { useI18n } from '@/lib/i18n';

interface CmsPage {
  slug: string;
  content: Partial<Record<Locale, { title: string; body: string }>>;
  updatedAt: string;
}

type Block = { kind: 'h2' | 'h3' | 'p' | 'li'; text: string };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', apos: "'" };
const decode = (s: string) => s.replace(/&(amp|lt|gt|quot|#39|nbsp|apos);/g, (_, e: string) => ENTITIES[e]);

/**
 * An admin-edited page (terms, privacy, about, FAQ — §2.11) as headings, paragraphs and list
 * items. The body is HTML from the console's editor or Markdown; both read the same here.
 */
function blocks(body: string): Block[] {
  const html = /<\/?(p|h[1-6]|ul|ol|li|br|div|strong|em|a)\b/i.test(body);
  if (!html) {
    // Markdown, line by line: a heading or list line stands alone; other lines join into
    // paragraphs until a blank line.
    const out: Block[] = [];
    let paragraph: string[] = [];
    const flush = () => {
      if (paragraph.length) out.push({ kind: 'p', text: paragraph.join(' ').replace(/\*\*(.*?)\*\*/g, '$1') });
      paragraph = [];
    };
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (!line) flush();
      else if (heading) {
        flush();
        out.push({ kind: heading[1].length <= 2 ? 'h2' : 'h3', text: heading[2].trim() });
      } else if (/^[-*]\s+/.test(line)) {
        flush();
        out.push({ kind: 'li', text: line.replace(/^[-*]\s+/, '') });
      } else paragraph.push(line);
    }
    flush();
    return out;
  }
  const out: Block[] = [];
  const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    const text = decode(m[2].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t]+/g, ' ').trim();
    if (!text) continue;
    const tag = m[1].toLowerCase();
    out.push({ kind: tag === 'li' ? 'li' : tag === 'p' ? 'p' : tag <= 'h2' ? 'h2' : 'h3', text });
  }
  return out;
}

export default function CmsPageScreen() {
  const { slug = '' } = useLocalSearchParams<{ slug: string }>();
  const theme = useTheme();
  const { t, locale } = useI18n();
  const page = useQuery({ queryKey: ['page', slug], queryFn: () => api<CmsPage>(`/pages/${encodeURIComponent(slug)}`), staleTime: 5 * 60_000 });
  const text = page.data && (page.data.content[locale] ?? page.data.content.lo ?? page.data.content.en);

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: text?.title ?? '' }} />
      {page.isPending && <Loading />}
      {page.isError && (
        <View style={styles.pad}>
          {page.error instanceof ApiError && page.error.status === 404 ? <EmptyState icon="package" title={t.common.loadError} /> : <LoadError onRetry={() => void page.refetch()} />}
        </View>
      )}
      {text && page.data && (
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={styles.card}>
            <ThemedText type="title" style={styles.title}>
              {text.title}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {date(page.data.updatedAt, locale)}
            </ThemedText>
            {blocks(text.body).map((b, i) =>
              b.kind === 'li' ? (
                <View key={i} style={styles.li}>
                  <ThemedText type="small">•</ThemedText>
                  <ThemedText type="small" style={[styles.flex, styles.body]}>
                    {b.text}
                  </ThemedText>
                </View>
              ) : (
                <ThemedText key={i} type={b.kind === 'p' ? 'small' : b.kind === 'h2' ? 'subtitle' : 'smallBold'} style={b.kind === 'p' ? styles.body : styles.heading}>
                  {b.text}
                </ThemedText>
              ),
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  content: { padding: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.four, gap: Spacing.two },
  title: { fontSize: 24 },
  heading: { marginTop: Spacing.two },
  body: { lineHeight: 22 },
  li: { flexDirection: 'row', gap: Spacing.two, paddingLeft: Spacing.one },
});

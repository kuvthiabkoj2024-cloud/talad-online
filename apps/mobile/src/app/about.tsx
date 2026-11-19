import { MC_MART_CONTACT } from '@talad/shared';
import Constants from 'expo-constants';
import { Stack, useRouter } from 'expo-router';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { fill, useI18n } from '@/lib/i18n';

/**
 * What the website's footer holds, for the app (which has no footer): the admin-edited pages
 * (about, terms, privacy, FAQ — §2.11) and MC Mart's own contact and social accounts.
 */
export default function AboutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useI18n();
  const a = t.about;
  const pages = [
    ['about', a.about, 'shop'],
    ['terms', a.terms, 'receipt'],
    ['privacy', a.privacy, 'shield'],
    ['faq', a.faq, 'comment'],
  ] as const;
  const contact: { icon: IconName; label: string; sub?: string; url: string }[] = [
    { icon: 'phone', label: a.call, sub: MC_MART_CONTACT.phoneLabel, url: `tel:${MC_MART_CONTACT.phone}` },
    { icon: 'chat', label: 'WhatsApp', sub: MC_MART_CONTACT.phoneLabel, url: MC_MART_CONTACT.whatsapp },
  ];
  const social: { icon: IconName; label: string; url: string }[] = [
    { icon: 'users', label: 'Facebook', url: MC_MART_CONTACT.facebook },
    { icon: 'video', label: 'TikTok', url: MC_MART_CONTACT.tiktok },
  ];

  return (
    <>
      <Stack.Screen options={{ title: a.title }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {a.info}
        </ThemedText>
        <Card>
          {pages.map(([slug, label, icon], i) => (
            <Row key={slug} icon={icon} label={label} divider={i > 0} onPress={() => router.push(`/pages/${slug}`)} />
          ))}
        </Card>

        <ThemedText type="smallBold" themeColor="textSecondary">
          {a.contact}
        </ThemedText>
        <Card>
          {contact.map((c, i) => (
            <Row key={c.label} icon={c.icon} label={c.label} sub={c.sub} divider={i > 0} external onPress={() => void Linking.openURL(c.url)} />
          ))}
        </Card>

        <ThemedText type="smallBold" themeColor="textSecondary">
          {a.follow}
        </ThemedText>
        <Card>
          {social.map((c, i) => (
            <Row key={c.label} icon={c.icon} label={c.label} divider={i > 0} external onPress={() => void Linking.openURL(c.url)} />
          ))}
        </Card>

        {!!Constants.expoConfig?.version && (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
            MC Mart · {fill(a.version, { v: Constants.expoConfig.version })}
          </ThemedText>
        )}
      </ScrollView>
    </>
  );
}

function Row({ icon, label, sub, divider, external, onPress }: { icon: IconName; label: string; sub?: string; divider?: boolean; external?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={external ? 'link' : 'button'}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, pressed && styles.pressed]}>
      <Icon name={icon} size={22} color={theme.primary} />
      <View style={styles.flex}>
        <ThemedText type="small">{label}</ThemedText>
        {sub && (
          <ThemedText type="caption" themeColor="textSecondary">
            {sub}
          </ThemedText>
        )}
      </View>
      <Icon name={external ? 'external' : 'chevron-right'} size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three },
  pressed: { opacity: 0.7 },
  center: { textAlign: 'center', marginTop: Spacing.three },
});

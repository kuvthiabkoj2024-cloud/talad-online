import { Icon } from '@/components/icon';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, LoadError, Loading } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, localized, type CategoryNode } from '@/lib/api';
import { categoryIcon } from '@/lib/category-icons';
import { useI18n } from '@/lib/i18n';

/** Every category with its sub-categories; tapping one lists its products. */
export default function CategoriesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories') });

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={categories.isRefetching} onRefresh={() => void categories.refetch()} tintColor={theme.primary} />}>
      <Stack.Screen options={{ title: t.categories.title }} />
      {categories.isPending && <Loading />}
      {categories.isError && <LoadError onRetry={() => void categories.refetch()} />}
      {categories.data?.map((c) => (
        <Card key={c.id}>
          <Pressable onPress={() => router.push(`/category/${c.slug}`)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
                {c.iconUrl ? (
                  <Image source={c.iconUrl} style={styles.iconImage} contentFit="contain" tintColor={theme.primary} />
                ) : (
                  <Icon name={categoryIcon(c.slug)} size={22} color={theme.primary} />
                )}
              </View>
              <ThemedText type="smallBold" style={styles.flex}>
                {localized(c.name, locale)}
              </ThemedText>
              <Icon name="chevron-right" size={18} color={theme.textSecondary} />
          </Pressable>
          {c.children.length > 0 && (
            <View style={[styles.children, { borderTopColor: theme.border }]}>
              {c.children.map((child) => (
                <Pressable
                  key={child.id}
                  onPress={() => router.push(`/category/${child.slug}`)}
                  style={({ pressed }) => [styles.child, { backgroundColor: theme.backgroundElement }, pressed && styles.pressed]}>
                  <ThemedText type="caption">{localized(child.name, locale)}</ThemedText>
                </Pressable>
              ))}
            </View>
          )}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: Spacing.three },
  pressed: { opacity: 0.7 },
  icon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconImage: { width: 24, height: 24 },
  flex: { flex: 1 },
  children: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, padding: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  child: { borderRadius: 999, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
});

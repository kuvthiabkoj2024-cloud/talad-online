import { useQuery } from '@tanstack/react-query';
import { DEFAULT_LOCALE } from '@talad/shared';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ComingSoon, Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api, type CategoryNode } from '@/lib/api';

export default function HomeScreen() {
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<CategoryNode[]>('/categories'),
  });

  return (
    <Screen title="Taladonline">
      <ThemedText type="subtitle">Categories</ThemedText>
      {categories.isPending && <ActivityIndicator />}
      {categories.error && (
        <ThemedText type="small" themeColor="textSecondary">
          Could not reach the API. Is services/api running?
        </ThemedText>
      )}
      <View style={styles.grid}>
        {categories.data?.map((c) => (
          <ThemedView key={c.id} type="backgroundElement" style={styles.chip}>
            <ThemedText type="small">{c.name[DEFAULT_LOCALE] ?? c.name.en ?? c.slug}</ThemedText>
          </ThemedView>
        ))}
      </View>

      <ThemedText type="subtitle">Popular products</ThemedText>
      <ComingSoon scopeRef="§4.3" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.four,
  },
});

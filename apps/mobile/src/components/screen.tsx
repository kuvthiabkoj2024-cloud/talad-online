import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

/** Standard tab screen: safe area, title and scrollable content. */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title">{title}</ThemedText>
          {children}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export function ComingSoon({ scopeRef }: { scopeRef: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.placeholder}>
      <ThemedText type="small" themeColor="textSecondary">
        Not implemented yet — see {scopeRef} in marketplace-project-scope.md.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  safeArea: { flex: 1, maxWidth: MaxContentWidth },
  content: {
    padding: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  placeholder: { padding: Spacing.three, borderRadius: Spacing.three },
});

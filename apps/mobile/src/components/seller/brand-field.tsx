import { BRAND_RULES } from '@talad/shared';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Input } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';

/** A brand name box with brands already on MC Mart as chips to tap (one spelling per brand). */
export function BrandField({ value, placeholder, onChange, autoFocus }: { value: string; placeholder: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  const theme = useTheme();
  const term = useDeferredValue(value.trim());
  const suggestions = useQuery({
    queryKey: ['brands', 'suggest', term],
    queryFn: () => api<{ slug: string; name: string }[]>(`/brands?${new URLSearchParams({ limit: '8', ...(term && { q: term }) })}`),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });
  const chips = (suggestions.data ?? []).filter((b) => b.name.toLowerCase() !== term.toLowerCase());
  return (
    <View style={styles.brand}>
      <Input value={value} onChangeText={onChange} placeholder={placeholder} maxLength={BRAND_RULES.nameMax} autoCorrect={false} autoFocus={autoFocus} />
      {chips.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.brandChips}>
          {chips.map((b) => (
            <Pressable key={b.slug} accessibilityRole="button" onPress={() => onChange(b.name)} style={[styles.brandChip, { borderColor: theme.border, backgroundColor: theme.backgroundElement }]}>
              <ThemedText type="caption">{b.name}</ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  brand: { gap: Spacing.two },
  brandChips: { gap: Spacing.two },
  brandChip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.full, paddingHorizontal: Spacing.three, paddingVertical: 6 },
});

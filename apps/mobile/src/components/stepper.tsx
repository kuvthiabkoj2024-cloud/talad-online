import { Icon } from '@/components/icon';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** − 2 + quantity control (product page and cart). */
export function Stepper({ value, max, onChange, disabled }: { value: number; max: number; onChange: (n: number) => void; disabled?: boolean }) {
  const theme = useTheme();
  const step = (d: number) => onChange(Math.min(max, Math.max(1, value + d)));
  const button = (icon: 'remove' | 'add', d: number, off: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={icon === 'add' ? '+' : '-'} disabled={off || disabled} onPress={() => step(d)} hitSlop={6} style={[styles.stepButton, (off || disabled) && styles.off]}>
      <Icon name={icon} size={18} color={theme.text} />
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { borderColor: theme.border }]}>
      {button('remove', -1, value <= 1)}
      <ThemedText type="smallBold" style={styles.stepValue}>
        {value}
      </ThemedText>
      {button('add', 1, value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: Radius.sm },
  stepButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 32, textAlign: 'center' },
  off: { opacity: 0.35 },
});

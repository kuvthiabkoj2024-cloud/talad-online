import { Icon } from '@/components/icon';
import { useState, type ReactNode } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A labelled form row with an optional hint underneath. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {children}
      {hint && (
        <ThemedText type="caption" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </View>
  );
}

/** Text box; 16px text so phones don't zoom in on it (web build). */
export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textSecondary}
      {...props}
      style={[
        styles.input,
        { color: props.editable === false ? theme.textSecondary : theme.text, borderColor: theme.border, backgroundColor: props.editable === false ? theme.backgroundElement : theme.card },
        props.style,
      ]}
    />
  );
}

/** A choice from a list (province, bank) in a bottom sheet. */
export function Select({ value, options, placeholder, onChange }: { value: string; options: { value: string; label: string }[]; placeholder: string; onChange: (v: string) => void }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={[styles.input, styles.select, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <ThemedText type="small" themeColor={current ? 'text' : 'textSecondary'} style={styles.flex} numberOfLines={1}>
          {current?.label ?? placeholder}
        </ThemedText>
        <Icon name="chevron-down" size={18} color={theme.textSecondary} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + Spacing.two }]}>
          <ThemedText type="smallBold" style={styles.sheetTitle}>
            {placeholder}
          </ThemedText>
          <FlatList
            data={options}
            keyExtractor={(o) => o.value}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, { borderTopColor: theme.border }, pressed && { backgroundColor: theme.backgroundElement }]}>
                <ThemedText type="small" style={styles.flex}>
                  {item.label}
                </ThemedText>
                {item.value === value && <Icon name="check" size={20} color={theme.primary} />}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

export function Toggle({ label, value, onChange, disabled }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.toggle}>
      <ThemedText type="small" style={styles.flex}>
        {label}
      </ThemedText>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: theme.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { gap: Spacing.one + 2 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 16, fontFamily: FontFamily.regular },
  select: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '70%', borderTopLeftRadius: Radius.lg + 4, borderTopRightRadius: Radius.lg + 4, paddingTop: Spacing.three },
  sheetTitle: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  option: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 44 },
});

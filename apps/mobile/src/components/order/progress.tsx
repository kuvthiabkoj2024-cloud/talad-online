import type { OrderStatus } from '@talad/shared';
import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { BrandGreen, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Placed → paid → sent → completed: reached steps green, the one in progress amber (as the website's tracker). */
const STEPS: { status: OrderStatus; icon: IconName }[] = [
  { status: 'PENDING', icon: 'receipt' },
  { status: 'CONFIRMED', icon: 'package' },
  { status: 'SHIPPED', icon: 'truck' },
  { status: 'COMPLETED', icon: 'done' },
];
const STEP_OF: Partial<Record<OrderStatus, OrderStatus>> = { PACKED: 'CONFIRMED', DELIVERED: 'SHIPPED', RETURN_REQUESTED: 'SHIPPED' };

export function Progress({ status, labels, waitingLabels }: { status: OrderStatus; labels: string[]; waitingLabels: string[] }) {
  const theme = useTheme();
  const reached = STEPS.findIndex((s) => s.status === (STEP_OF[status] ?? status));
  return (
    <View style={styles.steps}>
      {STEPS.map((step, i) => {
        const done = i <= reached;
        const progressing = i === reached + 1 && status !== 'RETURN_REQUESTED';
        const color = done ? BrandGreen : progressing ? '#f59e0b' : theme.backgroundElement;
        return (
          <View key={step.status} style={styles.step}>
            {i > 0 && <View style={[styles.line, { backgroundColor: done ? BrandGreen : theme.border }]} />}
            <View style={[styles.stepIcon, { backgroundColor: color }]}>
              <Icon name={done ? 'check' : step.icon} size={18} color={done || progressing ? '#ffffff' : theme.textSecondary} />
            </View>
            <ThemedText type="caption" themeColor={done ? 'text' : 'textSecondary'} style={[styles.stepLabel, progressing && { color: '#b45309' }]}>
              {progressing ? waitingLabels[i] : labels[i]}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row' },
  step: { flex: 1, alignItems: 'center', gap: Spacing.one },
  // From the previous circle's edge to this one's (circles are 36 wide, plus a small gap).
  line: { position: 'absolute', top: 17, left: '-50%', right: '50%', marginHorizontal: 22, height: 2 },
  stepIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  stepLabel: { textAlign: 'center', fontSize: 11, lineHeight: 14 },
});

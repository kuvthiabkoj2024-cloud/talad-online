import type { OrderStatus } from '@talad/shared';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useSellerI18n } from '@/lib/seller-i18n';

/** Status colours, as the Seller Center's badges: amber waits, blue is on its way, green is done, red stopped. */
export const ORDER_TONE: Record<OrderStatus, { bg: string; fg: string }> = {
  PENDING: { bg: '#fef3c7', fg: '#92400e' },
  CONFIRMED: { bg: '#fef3c7', fg: '#92400e' },
  PACKED: { bg: '#fef3c7', fg: '#92400e' },
  SHIPPED: { bg: '#dbeafe', fg: '#1e40af' },
  DELIVERED: { bg: '#dbeafe', fg: '#1e40af' },
  COMPLETED: { bg: '#dcfce7', fg: '#166534' },
  CANCELLED: { bg: '#f3f4f6', fg: '#4b5563' },
  RETURN_REQUESTED: { bg: '#fee2e2', fg: '#991b1b' },
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  const { s } = useSellerI18n();
  const tone = ORDER_TONE[status];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <ThemedText type="caption" style={[styles.text, { color: tone.fg }]}>
        {s.orders.status[status]}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: Radius.full, paddingHorizontal: Spacing.two + 2, paddingVertical: 2 },
  text: { fontWeight: '700' },
});

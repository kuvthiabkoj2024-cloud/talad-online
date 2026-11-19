import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

/**
 * The cart's item count on its icon. When the count goes up (something was added), the badge
 * pops and the icon it sits on gives a little shake via `onBump`, instead of a popup.
 */
export function CartBadge({ count, onBump }: { count: number; onBump?: () => void }) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const last = useRef(count);

  useEffect(() => {
    if (count > last.current) {
      scale.value = withSequence(withTiming(1.6, { duration: 140 }), withSpring(1, { damping: 6, stiffness: 220 }));
      onBump?.();
    }
    last.current = count;
  }, [count, scale, onBump]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  if (!count) return null;
  return (
    <Animated.View style={[styles.badge, { backgroundColor: theme.sale }, style]}>
      <ThemedText style={styles.text}>{count > 99 ? '99+' : count}</ThemedText>
    </Animated.View>
  );
}

/** Wiggles its child (the cart icon) when `bump` is called. */
export function useWiggle() {
  const rotate = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotate.value}deg` }] }));
  const bump = () => {
    rotate.value = withSequence(withTiming(-14, { duration: 70 }), withTiming(12, { duration: 90 }), withTiming(-8, { duration: 80 }), withTiming(0, { duration: 80 }));
  };
  return { style, bump };
}

const styles = StyleSheet.create({
  badge: { position: 'absolute', top: -5, right: -11, minWidth: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center' },
  text: { color: '#ffffff', fontSize: 10, lineHeight: 17, fontWeight: '700' },
});

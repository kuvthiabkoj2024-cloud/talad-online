import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

/**
 * Keeps what's being typed above the keyboard. Android apps are edge-to-edge (the window no
 * longer shrinks for the keyboard), so React Native's own KeyboardAvoidingView did nothing there.
 *
 * Every screen using this fills the screen down to its bottom edge (chats, forms, sheets), so
 * the content is simply padded by the keyboard's height, which react-native-keyboard-controller
 * reports from the bottom of the screen (navigation bar included), following the keyboard as it
 * slides. No measuring of where the view sits: that measurement (KeyboardAvoidingView's
 * `automaticOffset`) came out short on some Android phones and left the message box half hidden.
 */
export function KeyboardAvoid({
  children,
  style,
  bottomInset = 0,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Space the screen's bottom bar already keeps for the navigation bar (its `insets.bottom`):
   * left out while the keyboard is open, so the bar sits right on the keyboard, without a gap.
   */
  bottomInset?: number;
}) {
  const { height } = useReanimatedKeyboardAnimation();
  // `height` is negative while the keyboard is open (it's meant for translateY).
  const padding = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, Math.abs(height.value) - bottomInset) }));
  return <Animated.View style={[style, padding]}>{children}</Animated.View>;
}

import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

/**
 * Keeps what's being typed above the keyboard. Android apps are edge-to-edge (the window no
 * longer shrinks for the keyboard), so React Native's own KeyboardAvoidingView did nothing there
 * and the keyboard covered chat boxes and comment fields. This one follows the keyboard on both
 * platforms and works out its own offset under headers and inside sheets.
 */
export function KeyboardAvoid({ children, style, offset = 0 }: { children: ReactNode; style?: StyleProp<ViewStyle>; offset?: number }) {
  return (
    <KeyboardAvoidingView behavior="padding" automaticOffset keyboardVerticalOffset={offset} style={style}>
      {children}
    </KeyboardAvoidingView>
  );
}

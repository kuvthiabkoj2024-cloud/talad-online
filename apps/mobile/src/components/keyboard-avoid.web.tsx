import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/** On the web the browser keeps the focused field in view. */
export function KeyboardAvoid({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle>; offset?: number }) {
  return <View style={style}>{children}</View>;
}

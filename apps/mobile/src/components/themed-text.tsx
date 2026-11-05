import { StyleSheet, Text, type TextProps } from 'react-native';

import { fontFamilyFor, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'subtitle' | 'small' | 'smallBold' | 'caption' | 'link';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const merged = StyleSheet.flatten([{ color: theme[themeColor ?? (type === 'link' ? 'primary' : 'text')] }, styles[type], style]);
  // The website's font in the weight asked for (the weight picks the font file, so it isn't faked on top).
  return <Text style={[merged, { fontFamily: fontFamilyFor(merged.fontWeight), fontWeight: 'normal' }]} {...rest} />;
}

// Lao marks sit above and below the line: generous line heights keep them from clipping.
const styles = StyleSheet.create({
  default: { fontSize: 15, lineHeight: 24, fontWeight: '500' },
  title: { fontSize: 22, lineHeight: 32, fontWeight: '700' },
  subtitle: { fontSize: 18, lineHeight: 28, fontWeight: '700' },
  small: { fontSize: 13, lineHeight: 20, fontWeight: '500' },
  smallBold: { fontSize: 13, lineHeight: 20, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '500' },
  link: { fontSize: 14, lineHeight: 22, fontWeight: '600' },
});

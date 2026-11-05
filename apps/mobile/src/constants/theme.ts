/**
 * MC Mart colours, matching the storefront (apps/web globals.css): brand green, soft greys,
 * white cards, red for sales. Light and dark, like the website.
 */

import '@/global.css';

import { Platform } from 'react-native';

/** The header and brand surfaces stay this green in both themes (white text on it). */
export const BrandGreen = '#2e7d32';

export const Colors = {
  light: {
    text: '#1f2937',
    textSecondary: '#6b7280',
    background: '#f3f4f6',
    card: '#ffffff',
    border: '#e5e7eb',
    backgroundElement: '#eef0f2',
    backgroundSelected: '#e0e2e6',
    primary: '#2e7d32',
    primarySoft: '#e8f5e9',
    onPrimary: '#ffffff',
    sale: '#dc2626',
    star: '#f59e0b',
  },
  dark: {
    text: '#e5e7eb',
    textSecondary: '#9ca3af',
    background: '#0f1411',
    card: '#18201b',
    border: '#2a332d',
    backgroundElement: '#202a23',
    backgroundSelected: '#2a352d',
    primary: '#4caf50',
    primarySoft: '#1d3321',
    onPrimary: '#ffffff',
    sale: '#f87171',
    star: '#fbbf24',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

/**
 * The website's font, Noto Sans Lao Looped (Lao and Latin), one file per weight: Android
 * can't make a custom font bold itself, so each weight names its own file.
 */
export const FontFamily = {
  regular: 'NotoSansLaoLooped_400Regular',
  medium: 'NotoSansLaoLooped_500Medium',
  semibold: 'NotoSansLaoLooped_600SemiBold',
  bold: 'NotoSansLaoLooped_700Bold',
  extrabold: 'NotoSansLaoLooped_800ExtraBold',
} as const;

/** The font file for a weight ("700" → the Bold file). */
export function fontFamilyFor(weight: string | number | undefined): string {
  const w = Number(weight === 'bold' ? 700 : weight === 'normal' || weight === undefined ? 400 : weight);
  if (w >= 800) return FontFamily.extrabold;
  if (w >= 700) return FontFamily.bold;
  if (w >= 600) return FontFamily.semibold;
  if (w >= 500) return FontFamily.medium;
  return FontFamily.regular;
}

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

export const MaxContentWidth = 800;

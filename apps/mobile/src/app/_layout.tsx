import {
  NotoSansLaoLooped_400Regular,
  NotoSansLaoLooped_500Medium,
  NotoSansLaoLooped_600SemiBold,
  NotoSansLaoLooped_700Bold,
  NotoSansLaoLooped_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/noto-sans-lao-looped';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { Colors, FontFamily } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LocaleProvider } from '@/lib/i18n';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <AuthProvider>
          <Navigation />
        </AuthProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

/** Tabs at the bottom; product, search, category, orders and sign-in open above them. */
function Navigation() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const { ready } = useAuth();
  const [fontsLoaded, fontError] = useFonts({
    NotoSansLaoLooped_400Regular,
    NotoSansLaoLooped_500Medium,
    NotoSansLaoLooped_600SemiBold,
    NotoSansLaoLooped_700Bold,
    NotoSansLaoLooped_800ExtraBold,
  });
  // A font that fails to load falls back to the system font rather than keeping the app closed.
  const fonts = fontsLoaded || !!fontError;

  // Keep the splash up until the saved session is checked and the font is in, so the app opens
  // signed in and never flashes in another font.
  useEffect(() => {
    if (ready && fonts) void SplashScreen.hideAsync();
  }, [ready, fonts]);
  if (!ready || !fonts) return null;

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.card, text: colors.text, border: colors.border },
      }}>
      <Stack screenOptions={{ headerTintColor: colors.primary, headerBackButtonDisplayMode: 'minimal', headerTitleStyle: { color: colors.text, fontFamily: FontFamily.bold } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}

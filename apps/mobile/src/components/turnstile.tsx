import type { Locale } from '@talad/shared';
import { Platform, StyleSheet, useColorScheme } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { SITE_URL } from '@/lib/api';

/** Cloudflare Turnstile site key (the website's); without it there's no robot check (development). */
export const TURNSTILE_SITE_KEY = Platform.OS === 'web' ? null : process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || null;

/**
 * Cloudflare's robot check, as on the website: its box ("Verifying… → Success", a checkbox when
 * Cloudflare is unsure). Turnstile only runs on pages of an allowed hostname, so the web view
 * loads the storefront's /app-turnstile.html. Reports a token (single use, sent as
 * X-Turnstile-Token) or null, and Cloudflare's error code when the check can't run.
 * Change `resetKey` after each use (and drop the used token). Not shown in the web build (it has no web view).
 */
export function Turnstile({
  locale,
  action,
  resetKey = 0,
  onToken,
  onError,
}: {
  locale: Locale;
  action: string;
  resetKey?: number;
  onToken: (token: string | null) => void;
  onError?: (code: string) => void;
}) {
  const theme = useColorScheme() === 'dark' ? 'dark' : 'light';

  if (!TURNSTILE_SITE_KEY) return null;

  function onMessage(e: WebViewMessageEvent) {
    try {
      const m = JSON.parse(e.nativeEvent.data) as { token?: string | null; error?: string };
      if ('token' in m) onToken(m.token ?? null);
      if (m.error) {
        onToken(null);
        onError?.(m.error);
      }
    } catch {
      // Not ours.
    }
  }

  const query = new URLSearchParams({ k: TURNSTILE_SITE_KEY, a: action, l: locale, t: theme });
  return (
    <WebView
      // A new resetKey loads the check again: a fresh token (each works once).
      key={resetKey}
      source={{ uri: `${SITE_URL}/app-turnstile.html?${query}` }}
      onMessage={onMessage}
      onError={() => onError?.('network')}
      onHttpError={() => onError?.('network')}
      scrollEnabled={false}
      bounces={false}
      style={styles.box}
      containerStyle={styles.box}
    />
  );
}

const styles = StyleSheet.create({
  // Cloudflare's box is 65 px tall, plus room for its "testing only" line with test keys.
  box: { height: 72, backgroundColor: 'transparent' },
});

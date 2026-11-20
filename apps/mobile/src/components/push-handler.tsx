import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { registerPush, routeFor, type PushData } from '@/lib/push-notifications';

type NotificationsModule = typeof import('expo-notifications');

/**
 * Push notifications in the app: registers the phone once signed in (again when the language
 * changes, so pushes come in that language), and opens the right screen when one is tapped,
 * including the tap that launched the app.
 */
export function PushHandler() {
  const router = useRouter();
  const { customer } = useAuth();
  const { locale } = useI18n();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (customer) void registerPush(locale).catch(() => {});
  }, [customer?.id, locale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Platform.OS === 'web') return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const n = require('expo-notifications') as NotificationsModule;
    const open = (response: import('expo-notifications').NotificationResponse | null) => {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handled.current === id) return;
      handled.current = id;
      router.push(routeFor((response.notification.request.content.data ?? {}) as PushData));
    };
    void n.getLastNotificationResponseAsync().then(open);
    const sub = n.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [router]);

  return null;
}

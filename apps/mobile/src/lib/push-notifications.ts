import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type { Href } from 'expo-router';
import { Platform } from 'react-native';

import { api } from './api';
import { storage } from './storage';

type NotificationsModule = typeof import('expo-notifications');

/** The phone's Expo push token, kept to unregister it on sign-out. */
const TOKEN_KEY = 'mcmart.pushToken';

/** Android channels the API sends to (ExpoPushService): each can be muted in the phone's settings. */
const CHANNELS = [
  { id: 'orders', lo: 'ຄຳສັ່ງຊື້', en: 'Orders', importance: 'HIGH' },
  { id: 'chats', lo: 'ແຊັດ', en: 'Chats', importance: 'HIGH' },
  { id: 'promotions', lo: 'ໂປຣໂມຊັນ', en: 'Promotions', importance: 'DEFAULT' },
  { id: 'default', lo: 'ທົ່ວໄປ', en: 'General', importance: 'HIGH' },
] as const;

/** What a push carries (services/api ExpoPushService) to open the right screen. */
export interface PushData {
  app?: 'customer' | 'seller';
  link?: string;
  conversationId?: string;
}

let configured = false;

/** expo-notifications, or null on the web (the website has its own Web Push). */
function notifications(): NotificationsModule | null {
  if (Platform.OS === 'web') return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const n = require('expo-notifications') as NotificationsModule;
  if (!configured) {
    // While the app is open, still show the banner (a new order or chat shouldn't go unnoticed).
    n.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
    });
    configured = true;
  }
  return n;
}

/**
 * Asks once for permission, then registers this phone with the API so it gets push
 * notifications for the signed-in account (and the shop it owns). Quietly does nothing on the
 * web, on a simulator, or when the customer said no.
 */
export async function registerPush(locale: 'lo' | 'en'): Promise<void> {
  const n = notifications();
  if (!n || !Device.isDevice) return;
  if (Platform.OS === 'android') {
    for (const c of CHANNELS) {
      await n.setNotificationChannelAsync(c.id, {
        name: c[locale],
        importance: n.AndroidImportance[c.importance],
        sound: 'default',
        vibrationPattern: [0, 250, 150, 250],
        lightColor: '#2e7d32',
      });
    }
  }
  let permission = await n.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) permission = await n.requestPermissionsAsync();
  if (!permission.granted) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await n.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api('/me/push-devices', { method: 'PUT', body: { token, platform: Platform.OS === 'ios' ? 'ios' : 'android', locale } });
  await storage.set(TOKEN_KEY, token);
}

/** Signing out: this phone stops getting the account's notifications. */
export async function unregisterPush(): Promise<void> {
  const token = await storage.get(TOKEN_KEY);
  if (!token) return;
  await api('/me/push-devices', { method: 'DELETE', body: { token } }).catch(() => {});
  await storage.set(TOKEN_KEY, null);
}

/** Whether notifications are allowed on this phone (for Profile → Notifications). */
export async function pushPermission(): Promise<'granted' | 'denied' | 'unavailable'> {
  const n = notifications();
  if (!n || !Device.isDevice) return 'unavailable';
  return (await n.getPermissionsAsync()).granted ? 'granted' : 'denied';
}

/** Clears the number on the app icon (the notification list was opened). */
export function clearBadge(): void {
  void notifications()?.setBadgeCountAsync(0).catch(() => {});
}

/**
 * The screen a notification opens. Customer notifications carry storefront paths
 * (`/account/orders/TL…`, `/p/shop/product`…), shop ones Seller Center paths (`/orders/TL…`);
 * a customer's `seller:` link is seller news for the shop they own.
 */
export function routeFor(data: PushData): Href {
  if (data.conversationId) return data.app === 'seller' ? `/seller/messages/${data.conversationId}` : `/messages/${data.conversationId}`;
  const link = data.link ?? '';
  if (data.app === 'seller') return sellerRoute(link);
  if (link.startsWith('seller:')) return sellerRoute(link.slice('seller:'.length));
  return customerRoute(link);
}

function customerRoute(link: string): Href {
  const [path, query = ''] = link.split('?');
  const parts = (path ?? '').split('/').filter(Boolean);
  const post = new URLSearchParams(query).get('post');
  switch (parts[0]) {
    case 'account':
      if (parts[1] === 'orders') return parts[2] ? `/orders/${parts[2]}` : '/orders';
      if (parts[1] === 'points') return '/points';
      return '/notifications';
    case 'messages':
      return parts[1] ? `/messages/${parts[1]}` : '/messages';
    case 'p':
      return parts[1] && parts[2] ? `/product/${parts[1]}/${parts[2]}` : '/notifications';
    case 's':
      return parts[1] ? `/shop/${parts[1]}` : '/notifications';
    case 'c':
      return parts[1] ? `/category/${parts[1]}` : '/categories';
    case 'u':
      return parts[1] ? `/u/${parts[1]}` : '/notifications';
    case 'feed':
      return post ? `/watch/post/${post}` : '/feed';
    case 'pages':
      return parts[1] ? `/pages/${parts[1]}` : '/about';
    case 'cart':
      return '/cart';
    default:
      return '/notifications';
  }
}

function sellerRoute(link: string): Href {
  const parts = link.split('?')[0]!.split('/').filter(Boolean);
  if (!parts.length) return '/seller';
  switch (parts[0]) {
    case 'orders':
      return parts[1] ? `/seller/orders/${parts[1]}` : '/seller/orders';
    case 'messages':
      return parts[1] ? `/seller/messages/${parts[1]}` : '/seller/messages';
    case 'products':
      return parts[1] ? `/seller/products/${parts[1]}` : '/seller/products';
    case 'videos':
      return '/seller/videos';
    case 'finance':
      return '/seller/finance';
    case 'reviews':
      return '/seller/reviews';
    case 'cod':
      return '/seller/cod';
    case 'profile':
      return '/seller/profile';
    case 'register':
      return '/seller/register';
    default:
      return '/seller/notifications';
  }
}

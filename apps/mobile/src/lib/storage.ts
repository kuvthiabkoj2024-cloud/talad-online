import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Small key/value storage: the phone's secure store (keychain/keystore) for the sign-in
 * token, and the browser's localStorage for the web build (SecureStore has no web support).
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key).catch(() => null);
  },
  async set(key: string, value: string | null): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      } catch {
        // Private mode or blocked storage: the value just isn't kept.
      }
      return;
    }
    await (value === null ? SecureStore.deleteItemAsync(key) : SecureStore.setItemAsync(key, value)).catch(() => {});
  },
};

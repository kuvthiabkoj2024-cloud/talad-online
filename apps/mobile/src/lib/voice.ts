import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type SpeechPackage = typeof import('expo-speech-recognition');
export type Speech = SpeechPackage['ExpoSpeechRecognitionModule'];

/**
 * The phone's speech recognizer, or null where the app was built without it (Expo Go has no
 * speech module; the full app build does). Loaded only when present: importing the package
 * without its native module would crash the app.
 */
export function speechRecognizer(): Speech | null {
  if (Platform.OS === 'web' || !requireOptionalNativeModule('ExpoSpeechRecognition')) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('expo-speech-recognition') as SpeechPackage).ExpoSpeechRecognitionModule;
}

/**
 * The language to listen in: Lao when the phone's recognizer has it (Google's, on Android),
 * otherwise English (Apple's recognizer has no Lao). `english` tells the caller to say so.
 */
export async function listeningLanguage(speech: Speech, wanted: 'lo' | 'en'): Promise<{ lang: string; english: boolean }> {
  if (wanted === 'en') return { lang: 'en-US', english: false };
  try {
    const { locales } = await speech.getSupportedLocales({});
    const lao = locales.find((l) => /^lo([-_]|$)/i.test(l));
    return lao ? { lang: lao, english: false } : { lang: 'en-US', english: true };
  } catch {
    // Older Android can't list its languages: ask for Lao and let the recognizer decide.
    return { lang: 'lo-LA', english: false };
  }
}

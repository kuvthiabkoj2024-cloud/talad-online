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
 * Android: which recognition service to listen with. Google's (the Google app) understands Lao;
 * the phone's default may be another (Samsung phones default to Bixby, which has no Lao and often
 * returns nothing), so Google's is asked for by name when it's installed. Undefined elsewhere.
 */
export function recognitionService(speech: Speech): string | undefined {
  if (Platform.OS !== 'android') return undefined;
  try {
    const services = speech.getSpeechRecognitionServices();
    return ['com.google.android.googlequicksearchbox', 'com.google.android.as', 'com.google.android.tts'].find((p) => services.includes(p));
  } catch {
    return undefined;
  }
}

/** Resolves to undefined after `ms`: some phones never answer the locale lookup. */
const within = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

/**
 * The language to listen in: Lao when the phone's recognizer has it (Google's, on Android),
 * otherwise English (Apple's recognizer has no Lao). `english` tells the caller to say so.
 */
export async function listeningLanguage(speech: Speech, wanted: 'lo' | 'en', service?: string): Promise<{ lang: string; english: boolean }> {
  if (wanted === 'en') return { lang: 'en-US', english: false };
  try {
    const found = await within(speech.getSupportedLocales({ androidRecognitionServicePackage: service }), 2500);
    // No answer, or an empty list (common on Android): ask for Lao and let the recognizer decide.
    if (!found || found.locales.length === 0) return { lang: 'lo-LA', english: false };
    const lao = found.locales.find((l) => /^lo([-_]|$)/i.test(l));
    return lao ? { lang: lao, english: false } : { lang: 'en-US', english: true };
  } catch {
    // Older Android can't list its languages: ask for Lao and let the recognizer decide.
    return { lang: 'lo-LA', english: false };
  }
}

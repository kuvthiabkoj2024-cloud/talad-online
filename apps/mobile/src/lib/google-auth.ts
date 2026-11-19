import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

type GoogleSigninPackage = typeof import('@react-native-google-signin/google-signin');

/** The website's Google "Web application" client: ID tokens are issued for it, so the API accepts them as is. */
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
/** iOS only: the iOS OAuth client (its reversed id is also the app's URL scheme, see app.config.ts). */
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

let configured = false;

/**
 * Google sign-in, or null where it can't run: on the web (the website has its own button), in
 * Expo Go (no native module), without a web client id, or on iOS without an iOS client.
 */
function google(): GoogleSigninPackage | null {
  if (Platform.OS === 'web' || !WEB_CLIENT_ID) return null;
  if (Platform.OS === 'ios' && !IOS_CLIENT_ID) return null;
  if (!requireOptionalNativeModule('RNGoogleSignin')) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pkg = require('@react-native-google-signin/google-signin') as GoogleSigninPackage;
  if (!configured) {
    pkg.GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, ...(IOS_CLIENT_ID && { iosClientId: IOS_CLIENT_ID }) });
    configured = true;
  }
  return pkg;
}

export const googleSignInAvailable = () => google() !== null;

/**
 * Shows Google's account picker and returns the ID token for POST /auth/customer/google.
 * Null when the customer cancels. Throws 'PLAY_SERVICES' when the phone has no Google Play services.
 */
export async function googleIdToken(): Promise<string | null> {
  const pkg = google();
  if (!pkg) throw new Error('UNAVAILABLE');
  const { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } = pkg;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Always ask which account (not silently the last one), as the website's button does.
    await GoogleSignin.signOut().catch(() => {});
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return null;
    return res.data.idToken;
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) throw new Error('PLAY_SERVICES');
    }
    throw e;
  }
}

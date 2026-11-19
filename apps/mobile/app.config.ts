import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json, plus Google sign-in's iOS setup when an iOS OAuth client is configured.
 *
 * Android needs nothing here (only an Android OAuth client in Google Cloud with the app's
 * package and signing SHA-1). iOS needs the iOS client's reversed id as a URL scheme; without
 * it the plugin would fall back to Firebase mode and fail the build, so it's only added when set.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const iosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
  return {
    ...(config as ExpoConfig),
    plugins: [...(config.plugins ?? []), ...(iosUrlScheme ? [['@react-native-google-signin/google-signin', { iosUrlScheme }] as [string, unknown]] : [])],
  };
};

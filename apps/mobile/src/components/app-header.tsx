import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { BrandGreen, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

/** Room the search row takes: the gap above it, the bar, and space for its shadow. */
const SEARCH_ROW = Spacing.three + 46 + 6;

/**
 * The website's phone header: logo and name on brand green, order tracking, language switch, and a search bar
 * that opens Search. `searchShown` (0–1, from the page's scrolling) folds the search bar away
 * while scrolling down and brings it back on the way up, like the website.
 */
export function AppHeader({ searchShown }: { searchShown?: SharedValue<number> }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const searchRow = useAnimatedStyle(() => {
    const shown = searchShown ? searchShown.get() : 1;
    return { height: interpolate(shown, [0, 1], [0, SEARCH_ROW]), opacity: shown, transform: [{ translateY: interpolate(shown, [0, 1], [-12, 0]) }] };
  });
  return (
    <LinearGradient colors={['#388e3c', BrandGreen, '#1b5e20']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
      <View style={styles.row}>
        <Image source={require('@/assets/images/brand-logo.png')} style={styles.logo} contentFit="contain" />
        <ThemedText style={styles.brand}>{t.brand}</ThemedText>
        {/* Order tracking, as in the website's header. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.acct.trackOrder}
          onPress={() => router.push('/track')}
          hitSlop={6}
          style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
          <Icon name="track" size={20} color="#ffffff" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={locale === 'lo' ? 'English' : 'ລາວ'}
          onPress={() => setLocale(locale === 'lo' ? 'en' : 'lo')}
          style={({ pressed }) => [styles.lang, pressed && styles.pressed]}>
          <ThemedText type="smallBold" style={styles.onGreen}>
            {locale === 'lo' ? 'ລາວ' : 'EN'}
          </ThemedText>
          <Icon name="swap" size={14} color="#ffffff" />
        </Pressable>
      </View>
      <Animated.View style={[styles.searchRow, searchRow]}>
        <Pressable accessibilityRole="search" onPress={() => router.push('/search')} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
          <Icon name="search" size={19} color="#6b7280" />
          <ThemedText type="small" style={styles.placeholder} numberOfLines={1}>
            {t.searchPlaceholder}
          </ThemedText>
          {/* Straight into voice or photo search, like the website's scan button. */}
          <Pressable accessibilityRole="button" accessibilityLabel={t.search.voice} hitSlop={6} onPress={() => router.push({ pathname: '/search', params: { mode: 'voice' } })} style={styles.tool}>
            <Icon name="mic" size={20} color={BrandGreen} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t.search.scan} hitSlop={6} onPress={() => router.push({ pathname: '/search', params: { mode: 'scan' } })} style={styles.tool}>
            <Icon name="scan" size={20} color={BrandGreen} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.three, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, zIndex: 1 },
  searchRow: { paddingTop: Spacing.three, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  logo: { width: 34, height: 34 },
  brand: { color: '#ffffff', fontSize: 22, lineHeight: 30, fontWeight: '800', flex: 1 },
  lang: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  onGreen: { color: '#ffffff' },
  round: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' },
  search: {
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    height: 46,
    borderRadius: Radius.full,
    backgroundColor: '#ffffff',
    paddingLeft: Spacing.three + 2,
    paddingRight: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  placeholder: { flex: 1, color: '#6b7280' },
  tool: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85 },
});

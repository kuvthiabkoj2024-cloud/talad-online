import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';

/** The website's built-in slides: its three green gradients and icons. */
const DECOR: { icon: IconName; colors: [string, string, string] }[] = [
  { icon: 'truck', colors: ['#43a047', '#2e7d32', '#1b5e20'] },
  { icon: 'bag', colors: ['#388e3c', '#2e7d32', '#14471a'] },
  { icon: 'card', colors: ['#4caf50', '#388e3c', '#1b5e20'] },
];
const INTERVAL_MS = 5000;

/**
 * Home banner, as on the website: admin banners when any are running, otherwise the three
 * built-in promos. Swipe, or it moves on by itself every few seconds.
 */
export function HeroCarousel({ slides, banners }: { slides: { title: string; subtitle: string }[]; banners: { id: string; title: string; imageUrl: string }[] }) {
  const { width: screen } = useWindowDimensions();
  const width = Math.min(screen, MaxContentWidth) - Spacing.three * 2;
  const count = banners.length || slides.length;
  const [index, setIndex] = useState(0);
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    if (count < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearInterval(id);
  }, [count]);
  // Follow the current slide (a swipe lands on it already, so this changes nothing then).
  useEffect(() => {
    scroller.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={styles.track}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {banners.length
          ? banners.map((b) => (
              <View key={b.id} style={[styles.slide, { width }]}>
                <Image source={b.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
                {!!b.title && (
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.caption}>
                    <ThemedText type="subtitle" style={styles.white} numberOfLines={2}>
                      {b.title}
                    </ThemedText>
                  </LinearGradient>
                )}
              </View>
            ))
          : slides.map((s, i) => {
              const decor = DECOR[i % DECOR.length];
              return (
                <LinearGradient key={s.title} colors={decor.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.slide, styles.promo, { width }]}>
                  {/* Large, faint icon in the corner, like the website's slides. */}
                  <View style={styles.watermark}>
                    <Icon name={decor.icon} size={150} color="rgba(255,255,255,0.14)" strokeWidth={1.25} />
                  </View>
                  <View style={styles.badge}>
                    <Icon name={decor.icon} size={20} color="#ffffff" />
                  </View>
                  <ThemedText style={styles.title} numberOfLines={2}>
                    {s.title}
                  </ThemedText>
                  <ThemedText type="small" style={styles.subtitle} numberOfLines={2}>
                    {s.subtitle}
                  </ThemedText>
                </LinearGradient>
              );
            })}
      </ScrollView>
      {count > 1 && (
        <View style={styles.dots}>
          {Array.from({ length: count }, (_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: Radius.lg + 4 },
  slide: { height: 168, borderRadius: Radius.lg + 4, overflow: 'hidden' },
  promo: { padding: Spacing.four, justifyContent: 'flex-end', gap: Spacing.one },
  watermark: { position: 'absolute', right: -24, top: -12 },
  badge: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 'auto' },
  title: { color: '#ffffff', fontSize: 22, lineHeight: 32, fontWeight: '800' },
  subtitle: { color: 'rgba(255,255,255,0.88)' },
  white: { color: '#ffffff' },
  caption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Spacing.three, paddingTop: Spacing.five },
  dots: { position: 'absolute', bottom: Spacing.two + 2, alignSelf: 'center', flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.5)' },
  dotOn: { width: 18, backgroundColor: '#ffffff' },
});

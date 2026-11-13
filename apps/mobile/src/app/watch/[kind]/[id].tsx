import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { VideoRail } from '@/components/video/video-rail';
import { Spacing } from '@/constants/theme';
import { api, productHref, type FeedEntry, type FeedPost, type FeedProduct } from '@/lib/api';
import { count, priceRange } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

function setPlaying(player: VideoPlayer, playing: boolean) {
  if (playing) player.play();
  else player.pause();
}

/** One video full screen (from a profile's grid): a customer's post or a shop's product video. Tap to pause. */
export default function WatchScreen() {
  const { kind, id } = useLocalSearchParams<{ kind: 'post' | 'product'; id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const [paused, setPaused] = useState(false);
  const video = useQuery({
    queryKey: ['watch', kind, id],
    queryFn: (): Promise<FeedEntry> => (kind === 'post' ? api<FeedPost>(`/feed-posts/${id}`) : api<FeedProduct>(`/products/feed/${id}`)),
  });
  const item = video.data;
  const player = useVideoPlayer(item?.videoUrl ?? null, (p) => {
    p.loop = true;
  });
  useEffect(() => setPlaying(player, !!item && !paused), [player, item, paused]);

  const isPost = item?.kind === 'post';
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" />
      {item ? (
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setPaused((p) => !p)}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        </Pressable>
      ) : (
        <ActivityIndicator color="#ffffff" style={StyleSheet.absoluteFill} />
      )}
      {paused && (
        <View pointerEvents="none" style={styles.play}>
          <Icon name="play" size={44} color="#ffffff" fill="#ffffff" />
        </View>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={[styles.back, { top: insets.top + Spacing.two }]}>
        <Icon name="back" size={22} color="#ffffff" />
      </Pressable>
      {item && (
        <>
          <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.7)']} style={styles.shade} />
          <View style={[styles.side, { bottom: insets.bottom + Spacing.five }]}>
            <VideoRail item={item} active={!paused} onDeleted={() => router.back()} />
          </View>
          <View style={[styles.info, { paddingBottom: insets.bottom + Spacing.three }]}>
            <ThemedText type="smallBold" style={styles.white} numberOfLines={1}>
              {isPost ? (item as FeedPost).author.name : (item as FeedProduct).shop.name}
            </ThemedText>
            <ThemedText type="small" style={styles.white} numberOfLines={3}>
              {isPost ? (item as FeedPost).caption : (item as FeedProduct).name}
            </ThemedText>
            <ThemedText type="caption" style={styles.dim}>
              {fill(t.feed.views, { n: count(item.stats.views, locale) })}
            </ThemedText>
            {!isPost && (
              <View style={styles.buyRow}>
                <ThemedText type="subtitle" style={styles.white}>
                  {priceRange((item as FeedProduct).price, (item as FeedProduct).priceMax)}
                </ThemedText>
                <Button label={t.feed.buyNow} icon="bag" onPress={() => router.push(productHref(item as FeedProduct))} style={styles.buy} />
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  white: { color: '#ffffff' },
  dim: { color: 'rgba(255,255,255,0.7)' },
  play: { position: 'absolute', top: '45%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 40, padding: Spacing.three },
  back: { position: 'absolute', left: Spacing.three, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  shade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 280 },
  info: { position: 'absolute', left: 0, right: 72, bottom: 0, paddingHorizontal: Spacing.three, gap: 2 },
  side: { position: 'absolute', right: Spacing.two, alignItems: 'center' },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  buy: { minHeight: 40, paddingHorizontal: Spacing.three },
});

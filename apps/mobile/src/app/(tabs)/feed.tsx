import { Icon } from '@/components/icon';
import { useInfiniteQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { api, productHref, type FeedEntry } from '@/lib/api';
import { count, priceRange } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

type FeedType = 'shop' | 'customer';

/**
 * The website's video feed: one video per screen, swipe up for the next. Customers | Shops at
 * the top (Shops first, as on the website). Only the video on screen plays; tap it to pause.
 */
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [type, setType] = useState<FeedType>('shop');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(true);
  const [muted, setMuted] = useState(false);
  // The slide the viewer tapped to pause (by position); scrolling away resumes the next one.
  const [pausedIndex, setPausedIndex] = useState<number | null>(null);

  // Leaving the tab pauses the video; coming back resumes it.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const feed = useInfiniteQuery({
    queryKey: ['feed', type],
    queryFn: ({ pageParam }) =>
      api<{ items: FeedEntry[]; nextCursor: string | null }>(`/products/feed?type=${type}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];

  // FlatList needs this callback to stay the same for the list's whole life.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setActive(first.index);
  }, []);

  const switchTo = (next: FeedType) => {
    setType(next);
    setActive(0);
    setPausedIndex(null);
  };

  return (
    <View style={styles.screen} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      <StatusBar style="light" />
      {height > 0 && (
        <FlatList
          key={type}
          data={items}
          keyExtractor={(item) => item.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast"
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onEndReached={() => feed.hasNextPage && !feed.isFetchingNextPage && void feed.fetchNextPage()}
          onEndReachedThreshold={2}
          windowSize={3}
          initialNumToRender={2}
          maxToRenderPerBatch={2}
          renderItem={({ item, index }) => (
            <Slide
              item={item}
              height={height}
              active={focused && index === active}
              paused={pausedIndex === index}
              onTogglePause={() => setPausedIndex((p) => (p === index ? null : index))}
              preload={Math.abs(index - active) <= 1}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
            />
          )}
          ListEmptyComponent={
            feed.isPending ? (
              <View style={[styles.center, { height }]}>
                <ActivityIndicator color="#ffffff" />
              </View>
            ) : (
              <View style={[styles.center, { height }]}>
                <Icon name="video" size={48} color="rgba(255,255,255,0.6)" />
                <ThemedText type="smallBold" style={styles.white}>
                  {t.feed.empty}
                </ThemedText>
                <ThemedText type="small" style={styles.dim}>
                  {type === 'customer' ? t.feed.emptyBodyCustomers : t.feed.emptyBody}
                </ThemedText>
              </View>
            )
          }
        />
      )}

      {/* Customers | Shops, over the video at the top centre. */}
      <View style={[styles.tabs, { top: insets.top + Spacing.two }]}>
        {(
          [
            ['customer', t.feed.tabCustomers],
            ['shop', t.feed.tabShops],
          ] as const
        ).map(([key, label]) => (
          <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: type === key }} onPress={() => switchTo(key)} style={styles.tab}>
            <ThemedText type="smallBold" style={type === key ? styles.white : styles.dim}>
              {label}
            </ThemedText>
            {type === key && <View style={styles.underline} />}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Player settings, outside React (the player is a native object, not state). */
function applyPlayback(player: VideoPlayer, play: boolean, muted: boolean) {
  player.muted = muted;
  if (play) player.play();
  else player.pause();
}

function Slide({
  item,
  height,
  active,
  paused,
  onTogglePause,
  preload,
  muted,
  onToggleMute,
}: {
  item: FeedEntry;
  height: number;
  active: boolean;
  paused: boolean;
  onTogglePause: () => void;
  preload: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  // Far-away slides get no video loaded, so only the one on screen and its neighbours buffer.
  const player = useVideoPlayer(preload ? item.videoUrl : null, (p) => {
    p.loop = true;
  });

  useEffect(() => applyPlayback(player, active && !paused, muted), [player, active, paused, muted]);

  const isPost = item.kind === 'post';

  return (
    <View style={{ height }}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onTogglePause}>
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      </Pressable>
      {paused && (
        <View pointerEvents="none" style={styles.playIcon}>
          <Icon name="play" size={44} color="#ffffff" />
        </View>
      )}

      <View style={[styles.side, { bottom: Spacing.five }]}>
        <Pressable accessibilityLabel={muted ? t.feed.unmute : t.feed.mute} onPress={onToggleMute} style={styles.round}>
          <Icon name={muted ? 'volume-off' : 'volume-on'} size={22} color="#ffffff" />
        </Pressable>
      </View>

      {/* Keeps the white text readable over bright videos. */}
      <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.65)']} style={styles.bottomShade} />
      <View pointerEvents="box-none" style={[styles.info, { paddingBottom: Spacing.three }]}>
        <ThemedText type="smallBold" style={styles.white} numberOfLines={1}>
          {isPost ? item.author.name : item.shop.name}
        </ThemedText>
        <ThemedText type="small" style={styles.white} numberOfLines={2}>
          {isPost ? item.caption : item.name}
        </ThemedText>
        <ThemedText type="caption" style={styles.dim}>
          {fill(t.feed.views, { n: count(item.stats.views, locale) })}
        </ThemedText>
        {!isPost && (
          <View style={styles.buyRow}>
            <ThemedText type="subtitle" style={styles.white}>
              {priceRange(item.price, item.priceMax)}
            </ThemedText>
            <Button label={t.feed.buyNow} icon="bag" onPress={() => router.push(productHref(item))} style={styles.buy} />
          </View>
        )}
      </View>
      {/* Keeps the top tabs readable over bright videos. */}
      <View pointerEvents="none" style={[styles.topShade, { height: insets.top + 60 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingHorizontal: Spacing.five },
  white: { color: '#ffffff', textAlign: 'left' },
  dim: { color: 'rgba(255,255,255,0.7)' },
  tabs: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.one,
  },
  tab: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, alignItems: 'center' },
  underline: { position: 'absolute', bottom: 4, left: Spacing.three, right: Spacing.three, height: 2, borderRadius: 1, backgroundColor: '#ffffff' },
  playIcon: { position: 'absolute', top: '45%', alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 40, padding: Spacing.three },
  side: { position: 'absolute', right: Spacing.three, gap: Spacing.three },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  info: {
    position: 'absolute',
    left: 0,
    right: 72,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    gap: 2,
  },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  buy: { minHeight: 40, paddingHorizontal: Spacing.three },
  bottomShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 260 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.15)' },
});

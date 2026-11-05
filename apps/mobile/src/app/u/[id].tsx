import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, LoadError, Loading, Pill } from '@/components/ui';
import { BrandGreen, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, type FeedPost, type LikedVideo, type PublicProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { count, date } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';

/** A tile in the grid: a frame of the video when there is one, else a soft green tile. */
interface Tile {
  key: string;
  kind: 'post' | 'product';
  id: string;
  posterUrl: string | null;
  title: string;
  views: number;
}

/**
 * A customer's video profile, as on the website: photo, name, counts, and their videos in a
 * grid. On your own profile, a private "Liked" tab lists the videos you liked or saved.
 */
export default function VideoProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { customer } = useAuth();
  const mine = customer?.id === id;
  const [tab, setTab] = useState<'videos' | 'liked'>('videos');

  const profile = useQuery({ queryKey: ['profile', id], queryFn: () => api<PublicProfile>(`/profiles/${id}`) });
  const videos = useInfiniteQuery({
    queryKey: ['profile', id, 'videos'],
    queryFn: ({ pageParam }) => api<{ items: FeedPost[]; nextCursor: string | null }>(`/profiles/${id}/videos?limit=18${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const liked = useInfiniteQuery({
    queryKey: ['me', 'liked-videos'],
    queryFn: ({ pageParam }) => api<{ items: LikedVideo[]; nextCursor: string | null }>(`/me/liked-videos?limit=18${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: mine && tab === 'liked',
  });

  const list = tab === 'videos' ? videos : liked;
  const tiles: Tile[] =
    tab === 'videos'
      ? (videos.data?.pages.flatMap((p) => p.items) ?? []).map((v) => ({ key: v.id, kind: 'post', id: v.id, posterUrl: null, title: v.caption, views: v.stats.views }))
      : (liked.data?.pages.flatMap((p) => p.items) ?? []).map((v) => ({ key: `${v.kind}-${v.id}`, kind: v.kind, id: v.id, posterUrl: v.posterUrl, title: v.title, views: v.stats.views }));
  const p = profile.data;

  if (profile.isError)
    return (
      <View style={[styles.pad, { backgroundColor: theme.background, flex: 1 }]}>
        <Stack.Screen options={{ title: '' }} />
        {profile.error instanceof ApiError && profile.error.status === 404 ? <EmptyState icon="user" title={t.vp.notFound} /> : <LoadError onRetry={() => void profile.refetch()} />}
      </View>
    );

  return (
    <>
      <Stack.Screen options={{ title: p?.name ?? '' }} />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={profile.isRefetching} onRefresh={() => void Promise.all([profile.refetch(), list.refetch()])} tintColor={theme.primary} />}>
        {!p ? (
          <Loading />
        ) : (
          <LinearGradient colors={['#43a047', BrandGreen, '#1b5e20']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.avatar}>
              {p.avatarUrl ? <Image source={p.avatarUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <ThemedText style={styles.initials}>{initialsOf(p.name)}</ThemedText>}
            </View>
            <ThemedText type="subtitle" style={styles.white} numberOfLines={1}>
              {p.name}
            </ThemedText>
            <ThemedText type="caption" style={styles.soft}>
              {fill(t.vp.joined, { date: date(p.joinedAt, locale) })}
            </ThemedText>
            <View style={styles.stats}>
              {(
                [
                  [p.videos, t.vp.videos],
                  [p.followers, t.vp.followers],
                  [p.following, t.vp.following],
                  [p.likes, t.vp.likes],
                ] as const
              ).map(([n, label]) => (
                <View key={label} style={styles.stat}>
                  <ThemedText type="subtitle" style={styles.white}>
                    {count(n, locale)}
                  </ThemedText>
                  <ThemedText type="caption" style={styles.soft}>
                    {label}
                  </ThemedText>
                </View>
              ))}
            </View>
          </LinearGradient>
        )}

        {mine && (
          <View style={styles.tabs}>
            <Pill label={t.vp.videos} selected={tab === 'videos'} onPress={() => setTab('videos')} />
            <Pill label={t.vp.liked} selected={tab === 'liked'} onPress={() => setTab('liked')} />
          </View>
        )}
        {tab === 'liked' && (
          <ThemedText type="caption" themeColor="textSecondary">
            🔒 {t.vp.likedPrivate}
          </ThemedText>
        )}

        {list.isPending && list.fetchStatus !== 'idle' && <Loading />}
        {list.data && !tiles.length && (
          <EmptyState icon="video" title={tab === 'videos' ? t.vp.noVideos : t.vp.noLiked} body={tab === 'videos' ? (mine ? t.vp.noVideosMine : undefined) : t.vp.noLikedHint} />
        )}
        <View style={styles.grid}>
          {tiles.map((v) => (
            <Pressable key={v.key} onPress={() => router.push(`/watch/${v.kind}/${v.id}`)} style={styles.cell}>
              {({ pressed }) => (
                <View style={[styles.tile, { backgroundColor: theme.primarySoft }, pressed && styles.pressed]}>
                  {v.posterUrl ? (
                    <Image source={v.posterUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={styles.tileIcon}>
                      <Icon name="video" size={28} color={theme.primary} strokeWidth={1.5} />
                    </View>
                  )}
                  <LinearGradient colors={['transparent', 'rgba(0,0,0,0.6)']} style={styles.tileShade}>
                    {!!v.title && (
                      <ThemedText type="caption" style={styles.white} numberOfLines={2}>
                        {v.title}
                      </ThemedText>
                    )}
                    <View style={styles.views}>
                      <Icon name="play" size={11} color="#ffffff" fill="#ffffff" />
                      <ThemedText type="caption" style={styles.white}>
                        {count(v.views, locale)}
                      </ThemedText>
                    </View>
                  </LinearGradient>
                </View>
              )}
            </Pressable>
          ))}
        </View>
        {list.hasNextPage && <Button label={t.vp.loadMore} variant="outline" loading={list.isFetchingNextPage} onPress={() => void list.fetchNextPage()} />}
      </ScrollView>
    </>
  );
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const styles = StyleSheet.create({
  pad: { padding: Spacing.three },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  hero: { borderRadius: Radius.lg + 6, padding: Spacing.four, alignItems: 'center', gap: 2 },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: Spacing.two },
  initials: { color: BrandGreen, fontSize: 28, lineHeight: 36, fontWeight: '800' },
  white: { color: '#ffffff' },
  soft: { color: 'rgba(255,255,255,0.8)' },
  stats: { flexDirection: 'row', alignSelf: 'stretch', marginTop: Spacing.three, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: Radius.md, paddingVertical: Spacing.two },
  stat: { flex: 1, alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: Spacing.two },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 },
  cell: { width: '33.333%', padding: 3 },
  tile: { aspectRatio: 3 / 4, borderRadius: Radius.md, overflow: 'hidden' },
  tileIcon: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tileShade: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 6, paddingTop: Spacing.four, gap: 2 },
  views: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  pressed: { opacity: 0.8 },
});

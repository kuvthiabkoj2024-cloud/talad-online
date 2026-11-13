import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { CommentsSheet } from '@/components/video/comments-sheet';
import { Spacing } from '@/constants/theme';
import { api, productHref, type FeedEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { count } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';
import { sharePath, shareUrl, targetOf, VIEW_AFTER_MS, viewPath } from '@/lib/video';

const PINK = '#ff3b5c';

/**
 * The website's feed rail, on the right of a video: the shop or person (tap the "+" to follow),
 * a heart (favourite for product videos, like for customer videos), comments and share, each
 * with its count. A video counts as viewed after a few seconds on screen. Customers can delete
 * their own videos from here.
 */
export function VideoRail({ item, active, onDeleted }: { item: FeedEntry; active: boolean; onDeleted?: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const { customer } = useAuth();
  const target = targetOf(item);
  const isPost = item.kind === 'post';
  const mine = isPost && item.author.id === customer?.id;
  const signedIn = !!customer;

  const [stats, setStats] = useState({
    views: item.stats.views,
    hearts: isPost ? item.stats.likes : item.stats.favorites,
    comments: item.stats.comments,
    shares: item.stats.shares,
  });
  const [commentsOpen, setCommentsOpen] = useState(false);

  // Whether this viewer already liked / favourited it, and follows its shop or author.
  const heartKey = ['video-heart', target.kind, target.id] as const;
  const hearted = useQuery({
    queryKey: heartKey,
    enabled: signedIn,
    queryFn: async () =>
      isPost
        ? (await api<{ postIds: string[] }>(`/me/feed-posts/likes?ids=${item.id}`)).postIds.includes(item.id)
        : (await api<{ productIds: string[] }>(`/me/favorites/status?ids=${item.id}`)).productIds.includes(item.id),
  });
  const followId = isPost ? item.author.id : item.shop.id;
  const followKey = ['follow', isPost ? 'profile' : 'shop', followId] as const;
  const following = useQuery({
    queryKey: followKey,
    enabled: signedIn && !mine,
    queryFn: async () =>
      isPost
        ? (await api<{ customerIds: string[] }>(`/me/profile-follows/status?ids=${followId}`)).customerIds.includes(followId)
        : (await api<{ shopIds: string[] }>(`/me/follows/status?ids=${followId}`)).shopIds.includes(followId),
  });

  // One view per time on screen, after a few seconds of watching.
  const counted = useRef(false);
  useEffect(() => {
    if (!active || counted.current) return;
    const timer = setTimeout(() => {
      counted.current = true;
      void api<{ views: number }>(viewPath(target), { method: 'POST' })
        .then((r) => setStats((s) => ({ ...s, views: r.views })))
        .catch(() => {});
    }, VIEW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active, target.kind, target.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const needSignIn = () => {
    router.push('/login');
    return true;
  };

  async function toggleHeart() {
    if (!signedIn && needSignIn()) return;
    const on = !hearted.data;
    // Show it straight away; the server's answer sets the real count.
    queryClient.setQueryData(heartKey, on);
    setStats((s) => ({ ...s, hearts: Math.max(0, s.hearts + (on ? 1 : -1)) }));
    try {
      if (isPost) {
        const r = await api<{ liked: boolean; likes: number }>(`/me/feed-posts/${item.id}/like`, { method: on ? 'PUT' : 'DELETE' });
        queryClient.setQueryData(heartKey, r.liked);
        setStats((s) => ({ ...s, hearts: r.likes }));
      } else {
        const r = await api<{ favorited: boolean; favorites: number }>(`/me/favorites/${item.id}`, { method: on ? 'PUT' : 'DELETE' });
        queryClient.setQueryData(heartKey, r.favorited);
        setStats((s) => ({ ...s, hearts: r.favorites }));
      }
    } catch {
      queryClient.setQueryData(heartKey, !on);
      setStats((s) => ({ ...s, hearts: Math.max(0, s.hearts + (on ? -1 : 1)) }));
    }
  }

  async function follow() {
    if (!signedIn && needSignIn()) return;
    queryClient.setQueryData(followKey, true);
    try {
      await api(isPost ? `/me/profile-follows/${followId}` : `/me/follows/${followId}`, { method: 'PUT' });
      if (!isPost) void queryClient.invalidateQueries({ queryKey: ['me', 'follows'] });
    } catch {
      queryClient.setQueryData(followKey, false);
    }
  }

  async function share() {
    const url = shareUrl(item, locale);
    const name = isPost ? item.caption || item.author.name : item.name;
    try {
      const res = await Share.share({ message: `${fill(t.feed.shareText, { name })}\n${url}`, url });
      if (res.action !== Share.sharedAction) return;
      const r = await api<{ shares: number }>(sharePath(target), { method: 'POST' });
      setStats((s) => ({ ...s, shares: r.shares }));
    } catch {
      // Cancelled, or the count couldn't be saved: nothing to show.
    }
  }

  function removePost() {
    Alert.alert(t.feed.deletePost, t.feed.deletePostConfirm, [
      { text: t.feed.cancel, style: 'cancel' },
      {
        text: t.feed.delete,
        style: 'destructive',
        onPress: () =>
          void api(`/me/feed-posts/${item.id}`, { method: 'DELETE' })
            .then(() => {
              void queryClient.invalidateQueries({ queryKey: ['feed'] });
              onDeleted?.();
            })
            .catch(() => Alert.alert(t.common.error)),
      },
    ]);
  }

  const avatar = isPost ? item.author.avatarUrl : item.shop.logoUrl;
  const name = isPost ? item.author.name : item.shop.name;
  const showFollow = !mine && (!signedIn || following.data === false);

  return (
    <View style={styles.rail}>
      <View style={styles.avatarWrap}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={name}
          onPress={() => router.push(isPost ? `/u/${item.author.id}` : productHref(item))}
          style={styles.avatar}>
          {avatar ? (
            <Image source={avatar} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : isPost ? (
            <ThemedText type="smallBold" style={styles.initial}>
              {name.slice(0, 1).toUpperCase()}
            </ThemedText>
          ) : (
            <Icon name="shop" size={22} color="#2e7d32" />
          )}
        </Pressable>
        {showFollow && (
          <Pressable accessibilityRole="button" accessibilityLabel={fill(t.feed.follow, { name })} onPress={() => void follow()} style={styles.plus} hitSlop={6}>
            <Icon name="add" size={14} color="#ffffff" strokeWidth={3} />
          </Pressable>
        )}
      </View>

      <RailButton
        icon="heart"
        label={isPost ? (hearted.data ? t.feed.unlike : t.feed.like) : hearted.data ? t.feed.unfavorite : t.feed.favorite}
        value={count(stats.hearts, locale)}
        color={hearted.data ? PINK : '#ffffff'}
        fill={hearted.data ? PINK : 'none'}
        onPress={() => void toggleHeart()}
      />
      <RailButton icon="comment" label={t.feed.comments} value={count(stats.comments, locale)} onPress={() => setCommentsOpen(true)} />
      <RailButton icon="share" label={t.feed.share} value={count(stats.shares, locale)} onPress={() => void share()} />
      {mine && <RailButton icon="trash" label={t.feed.deletePost} onPress={removePost} />}

      <CommentsSheet
        target={commentsOpen ? target : null}
        total={stats.comments}
        onClose={() => setCommentsOpen(false)}
        onCount={(n) => setStats((s) => ({ ...s, comments: n }))}
      />
    </View>
  );
}

function RailButton({ icon, label, value, color = '#ffffff', fill = 'none', onPress }: { icon: IconName; label: string; value?: string; color?: string; fill?: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.button} hitSlop={4}>
      <Icon name={icon} size={30} color={color} fill={fill} strokeWidth={2} />
      {value !== undefined && <ThemedText style={styles.count}>{value}</ThemedText>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: { alignItems: 'center', gap: Spacing.three + 2 },
  avatarWrap: { marginBottom: Spacing.two },
  avatar: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: '#ffffff', backgroundColor: '#ffffff', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#2e7d32', fontSize: 18 },
  plus: { position: 'absolute', bottom: -10, alignSelf: 'center', width: 22, height: 22, borderRadius: 11, backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
  // A soft shadow keeps the white icons readable over bright videos.
  button: { alignItems: 'center', gap: 2, shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  count: { color: '#ffffff', fontSize: 12, lineHeight: 16, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 },
});

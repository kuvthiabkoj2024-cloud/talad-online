import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { count, date } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';
import { commentsPath, deleteCommentPath, postCommentPath, type CommentTarget, type VideoComment, type VideoCommentPage } from '@/lib/video';

const MAX_LENGTH = 500;
/** The shop reads its own video's comments through the Seller Center's routes. */
const readPath = (t: CommentTarget, asShop: boolean) => (asShop ? `/me/shop/videos/${t.id}/comments` : commentsPath(t));
const commentsKey = (t: CommentTarget) => ['video-comments', t.kind, t.id] as const;

/**
 * A video's comments, as the website's sheet: newest first, replies under each, write or reply
 * (signed in), delete your own. `onCount` reports the new total after posting or deleting.
 */
export function CommentsSheet({
  target,
  total,
  asShop = false,
  onClose,
  onCount,
}: {
  target: CommentTarget | null;
  total: number;
  /** The shop answering on its own product video (Seller Center → Videos): replies show as the shop. */
  asShop?: boolean;
  onClose: () => void;
  onCount: (n: number) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  const { customer } = useAuth();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<VideoComment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const comments = useInfiniteQuery({
    queryKey: target ? commentsKey(target) : ['video-comments', 'none'],
    queryFn: ({ pageParam }) => api<VideoCommentPage>(`${readPath(target!, asShop)}${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!target,
  });
  const items = comments.data?.pages.flatMap((p) => p.items) ?? [];

  const send = useMutation({
    mutationFn: () => api<VideoComment>(asShop ? `/me/shop/videos/${target!.id}/comments` : postCommentPath(target!), { method: 'POST', body: { body: text.trim(), ...(replyTo && { parentId: replyTo.id }) } }),
    onSuccess: () => {
      setText('');
      setReplyTo(null);
      setError(null);
      onCount(total + 1);
      void queryClient.invalidateQueries({ queryKey: ['video-comments'] });
    },
    onError: (e) => setError(e instanceof ApiError && e.code === 'COMMENT_TOO_LONG' ? t.feed.commentTooLong : t.feed.commentError),
  });

  const remove = (c: VideoComment) =>
    Alert.alert(t.feed.delete, undefined, [
      { text: t.feed.cancel, style: 'cancel' },
      {
        text: t.feed.delete,
        style: 'destructive',
        onPress: () =>
          void api(asShop ? `/me/shop/videos/comments/${c.id}` : deleteCommentPath(c.id), { method: 'DELETE' })
            .then(() => {
              onCount(Math.max(0, total - 1));
              void queryClient.invalidateQueries({ queryKey: ['video-comments'] });
            })
            .catch(() => Alert.alert(t.common.error)),
      },
    ]);

  return (
    <Modal visible={!!target} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.card, paddingBottom: insets.bottom + Spacing.two }]}>
          <View style={styles.head}>
            <ThemedText type="smallBold" style={styles.flex}>
              {fill(t.feed.commentsCount, { n: count(total, locale) })}
            </ThemedText>
            <Pressable accessibilityRole="button" accessibilityLabel={t.common.close} onPress={onClose} hitSlop={10}>
              <Icon name="x" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
            {comments.isPending && <ActivityIndicator color={theme.primary} style={styles.loading} />}
            {comments.data && !items.length && (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {t.feed.noComments}
              </ThemedText>
            )}
            {items.map((c) => (
              <CommentRow key={c.id} target={target!} asShop={asShop} comment={c} mine={asShop ? c.author.isShop : c.author.id === customer?.id} onReply={setReplyTo} onDelete={remove} />
            ))}
            {comments.hasNextPage && (
              <Pressable onPress={() => void comments.fetchNextPage()} style={styles.more}>
                <ThemedText type="smallBold" themeColor="primary">
                  {comments.isFetchingNextPage ? '…' : t.feed.moreComments}
                </ThemedText>
              </Pressable>
            )}
          </ScrollView>

          {customer ? (
            <View style={[styles.composer, { borderTopColor: theme.border }]}>
              {replyTo && (
                <View style={styles.replying}>
                  <ThemedText type="caption" themeColor="textSecondary" style={styles.flex} numberOfLines={1}>
                    {fill(t.feed.replyingTo, { name: replyTo.author.name })}
                  </ThemedText>
                  <Pressable accessibilityLabel={t.feed.cancelReply} onPress={() => setReplyTo(null)} hitSlop={8}>
                    <Icon name="x" size={16} color={theme.textSecondary} />
                  </Pressable>
                </View>
              )}
              {error && (
                <ThemedText type="caption" themeColor="sale">
                  {error}
                </ThemedText>
              )}
              <View style={styles.inputRow}>
                <TextInput
                  value={text}
                  onChangeText={(v) => (setText(v), setError(null))}
                  placeholder={t.feed.addComment}
                  placeholderTextColor={theme.textSecondary}
                  maxLength={MAX_LENGTH}
                  multiline
                  style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t.feed.send}
                  disabled={!text.trim() || send.isPending}
                  onPress={() => send.mutate()}
                  style={[styles.send, { backgroundColor: theme.primary }, (!text.trim() || send.isPending) && styles.disabled]}>
                  {send.isPending ? <ActivityIndicator color="#ffffff" /> : <Icon name="send" size={18} color="#ffffff" />}
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose();
                router.push('/login');
              }}
              style={[styles.signIn, { borderTopColor: theme.border }]}>
              <ThemedText type="smallBold" themeColor="primary">
                {t.feed.signInToComment}
              </ThemedText>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** One comment, with its replies (loaded when opened). */
function CommentRow({
  target,
  asShop = false,
  comment: c,
  mine,
  reply,
  onReply,
  onDelete,
}: {
  target: CommentTarget;
  asShop?: boolean;
  comment: VideoComment;
  mine: boolean;
  reply?: boolean;
  onReply: (c: VideoComment) => void;
  onDelete: (c: VideoComment) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { customer } = useAuth();
  const [open, setOpen] = useState(false);
  const replies = useInfiniteQuery({
    queryKey: ['video-comments', target.kind, target.id, 'replies', c.id],
    queryFn: ({ pageParam }) => api<VideoCommentPage>(`${readPath(target, asShop)}/${c.id}/replies${pageParam ? `?cursor=${pageParam}` : ''}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: open,
  });
  const list = replies.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <View style={[styles.comment, reply && styles.reply]}>
      <View style={[styles.avatar, { backgroundColor: theme.primarySoft }]}>
        {c.author.avatarUrl ? (
          <Image source={c.author.avatarUrl} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <ThemedText type="smallBold" themeColor="primary">
            {c.author.name.slice(0, 1).toUpperCase()}
          </ThemedText>
        )}
      </View>
      <View style={styles.flex}>
        <View style={styles.inline}>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.shrink}>
            {c.author.name}
          </ThemedText>
          {c.author.isShop && <Icon name="verified" size={13} color={theme.primary} />}
          <ThemedText type="caption" themeColor="textSecondary">
            · {date(c.createdAt, locale)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor={c.body === null ? 'textSecondary' : 'text'} style={c.body === null && styles.italic}>
          {c.body ?? t.feed.commentDeleted}
        </ThemedText>
        <View style={styles.actions}>
          {!reply && customer && c.body !== null && (
            <Pressable onPress={() => onReply(c)} hitSlop={6}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.bold}>
                {t.feed.reply}
              </ThemedText>
            </Pressable>
          )}
          {mine && c.body !== null && (
            <Pressable onPress={() => onDelete(c)} hitSlop={6}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.bold}>
                {t.feed.delete}
              </ThemedText>
            </Pressable>
          )}
        </View>
        {!reply && c.replyCount > 0 && (
          <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6}>
            <ThemedText type="caption" themeColor="primary" style={styles.bold}>
              {open ? t.feed.hideReplies : fill(t.feed.viewReplies, { n: c.replyCount })}
            </ThemedText>
          </Pressable>
        )}
        {open && (
          <View style={styles.replies}>
            {list.map((r) => (
              <CommentRow key={r.id} target={target} asShop={asShop} comment={r} mine={asShop ? r.author.isShop : r.author.id === customer?.id} reply onReply={onReply} onDelete={onDelete} />
            ))}
            {replies.hasNextPage && (
              <Pressable onPress={() => void replies.fetchNextPage()} hitSlop={6}>
                <ThemedText type="caption" themeColor="primary" style={styles.bold}>
                  {t.feed.moreReplies}
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { height: '72%', borderTopLeftRadius: Radius.lg + 4, borderTopRightRadius: Radius.lg + 4 },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  list: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three, gap: Spacing.three },
  loading: { paddingVertical: Spacing.five },
  empty: { textAlign: 'center', paddingVertical: Spacing.five },
  more: { alignItems: 'center', paddingVertical: Spacing.two },
  comment: { flexDirection: 'row', gap: Spacing.two + 2 },
  reply: { marginTop: Spacing.two },
  avatar: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  italic: { fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: 2 },
  bold: { fontWeight: '700' },
  replies: { marginTop: Spacing.one },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, gap: Spacing.one },
  replying: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two },
  input: { flex: 1, maxHeight: 110, minHeight: 42, borderRadius: 21, paddingHorizontal: Spacing.three, paddingTop: 10, paddingBottom: 10, fontSize: 15, fontFamily: FontFamily.regular },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.5 },
  signIn: { borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'center', paddingVertical: Spacing.three },
});

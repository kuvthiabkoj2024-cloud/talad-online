import { FEED_POST_RULES, MEDIA_LIMITS } from '@talad/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { fill, useI18n } from '@/lib/i18n';
import { uploadWithProgress } from '@/lib/video';

type Clip = { uri: string; name: string; type: string };

/**
 * Post a video to the feed (§2.5), as the website's "Post a video": film or pick a short clip,
 * add a caption, upload. The phone's own editor trims it to the length allowed and the picker
 * exports it at medium quality, so big phone videos upload quickly.
 */
export default function NewPostScreen() {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { customer } = useAuth();
  const [clip, setClip] = useState<Clip | null>(null);
  const [caption, setCaption] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const player = useVideoPlayer(clip?.uri ?? null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const seconds = MEDIA_LIMITS.maxVideoSeconds;

  if (!customer) {
    return (
      <View style={[styles.pad, styles.flex, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: t.feed.postTitle }} />
        <EmptyState icon="video" title={t.feed.signInToComment} action={<Button label={t.account.signIn} onPress={() => router.replace('/login')} style={styles.action} />} />
      </View>
    );
  }

  async function pick(from: 'camera' | 'library') {
    const permission = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(t.feed.permission);
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['videos'],
      // The phone's editor lets the customer trim to the allowed length.
      allowsEditing: true,
      videoMaxDuration: seconds,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    if (asset.duration && asset.duration > (seconds + 1) * 1000) return Alert.alert(fill(t.feed.videoTooLong, { seconds }));
    if (asset.fileSize && asset.fileSize > MEDIA_LIMITS.maxVideoBytes) return Alert.alert(t.feed.videoTooBig);
    setClip({ uri: asset.uri, name: asset.fileName ?? 'video.mp4', type: asset.mimeType ?? 'video/mp4' });
  }

  async function post() {
    if (!clip) return;
    setProgress(0);
    try {
      await uploadWithProgress('/me/feed-posts', caption.trim() ? { caption: caption.trim() } : {}, clip, setProgress);
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      Alert.alert(t.feed.posted);
      router.back();
    } catch {
      Alert.alert(t.feed.postError);
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: t.feed.postTitle }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          {fill(t.feed.postHint, { seconds })}
        </ThemedText>

        {clip ? (
          <View style={styles.preview}>
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          </View>
        ) : (
          <Card style={styles.placeholder}>
            <EmptyState icon="video" title={t.feed.chooseVideo} />
          </Card>
        )}

        <View style={styles.row}>
          <Button label={t.feed.recordVideo} icon="camera" variant="outline" disabled={busy} onPress={() => void pick('camera')} style={styles.flex} />
          <Button label={clip ? t.feed.changeVideo : t.feed.chooseVideo} icon="image" variant="outline" disabled={busy} onPress={() => void pick('library')} style={styles.flex} />
        </View>

        <Field label={t.feed.caption}>
          <Input
            value={caption}
            onChangeText={setCaption}
            placeholder={t.feed.captionPlaceholder}
            maxLength={FEED_POST_RULES.captionMax}
            multiline
            editable={!busy}
            style={styles.caption}
          />
          <ThemedText type="caption" themeColor="textSecondary" style={styles.counter}>
            {caption.length}/{FEED_POST_RULES.captionMax}
          </ThemedText>
        </Field>

        <ThemedText type="caption" themeColor="textSecondary">
          {t.feed.postRules}
        </ThemedText>

        <Button
          label={busy ? fill(t.feed.uploading, { n: Math.round((progress ?? 0) * 100) }) : t.feed.post}
          loading={busy}
          disabled={!clip || busy}
          onPress={() => void post()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  action: { marginTop: Spacing.two, alignSelf: 'stretch' },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  preview: { height: 360, borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: '#000000' },
  placeholder: { overflow: 'hidden' },
  row: { flexDirection: 'row', gap: Spacing.two },
  caption: { minHeight: 88, textAlignVertical: 'top', paddingTop: Spacing.two },
  counter: { textAlign: 'right' },
});

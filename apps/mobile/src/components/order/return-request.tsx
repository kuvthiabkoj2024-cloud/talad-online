import { RETURN_REASONS, RETURN_RULES, type ReturnReason } from '@talad/shared';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Field, Input } from '@/components/form';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/seller/sheet';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Pill } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError } from '@/lib/api';
import { fill, useI18n } from '@/lib/i18n';
import { useOrderI18n } from '@/lib/order-i18n';
import { orderPath } from '@/lib/orders';
import { shrinkPhoto } from '@/lib/shrink-photo';
import { uploadWithProgress } from '@/lib/video';

import { Notice } from './notice';

type Evidence = { uri: string; name: string; type: string; video: boolean; size: number | null; key?: string };

/**
 * "Problem with your order?": a reason and photos or one clip, sent directly to MC Mart (as the
 * website's return request). Files go up one by one first; the request then names their keys.
 */
export function ReturnRequest({ number, deadline, pointsNote, onDone }: { number: string; deadline: string | null; pointsNote: string | null; onDone: () => void }) {
  const theme = useTheme();
  const { t } = useI18n();
  const { o } = useOrderI18n();
  const r = o.account.returns;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReturnReason | null>(null);
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState<Evidence[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const message = (code: string | undefined) => (code && (r.errors as Record<string, string>)[code]) || r.errors.generic;

  async function add(from: 'camera' | 'gallery') {
    const permission = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(t.msg.cameraDenied);
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images', 'videos'],
      quality: 0.9,
      videoMaxDuration: 120,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      allowsMultipleSelection: from === 'gallery',
      selectionLimit: RETURN_RULES.maxFiles - files.length,
    };
    const res = from === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (res.canceled) return;
    const next = [...files];
    for (const asset of res.assets) {
      const video = asset.type === 'video';
      if (next.length >= RETURN_RULES.maxFiles || (video && next.some((f) => f.video))) return (setFiles(next), Alert.alert(message('TOO_MANY_FILES')));
      if (video) {
        if (asset.fileSize && asset.fileSize > RETURN_RULES.videoMaxBytes) return (setFiles(next), Alert.alert(message('FILE_TOO_LARGE')));
        next.push({ uri: asset.uri, name: asset.fileName ?? 'clip.mp4', type: asset.mimeType ?? 'video/mp4', video: true, size: asset.fileSize ?? null });
      } else {
        const photo = await shrinkPhoto(asset, 2560);
        next.push({ uri: photo.uri, name: photo.fileName ?? 'photo.jpg', type: photo.mimeType ?? 'image/jpeg', video: false, size: null });
      }
    }
    setFiles(next);
  }

  const askAdd = () =>
    Alert.alert(r.files, undefined, [
      { text: t.msg.camera, onPress: () => void add('camera') },
      { text: t.msg.gallery, onPress: () => void add('gallery') },
      { text: t.msg.cancel, style: 'cancel' },
    ]);

  async function submit() {
    if (!reason) return Alert.alert(message('REASON_REQUIRED'));
    if (!files.length) return Alert.alert(message('EVIDENCE_REQUIRED'));
    setProgress(0);
    try {
      const keys: string[] = [];
      for (const [i, f] of files.entries()) {
        if (!f.key) {
          const res = await uploadWithProgress<{ key: string }>(`${orderPath(number)}/return/evidence`, {}, { uri: f.uri, name: f.name, type: f.type }, (p) =>
            setProgress(Math.round(((i + p) / files.length) * 100)),
          );
          f.key = res.key;
        }
        keys.push(f.key);
      }
      await api(`${orderPath(number)}/return`, { method: 'POST', body: { reason, ...(details.trim() && { details: details.trim() }), evidenceKeys: keys } });
      setOpen(false);
      onDone();
    } catch (e) {
      Alert.alert(message(e instanceof ApiError ? e.code : undefined));
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;
  return (
    <>
      <Card style={styles.card}>
        <View style={styles.row}>
          <Icon name="swap" size={20} color={theme.primary} />
          <View style={styles.flex}>
            <ThemedText type="smallBold">{r.title}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {deadline ? fill(r.until, { date: deadline }) : r.body}
            </ThemedText>
          </View>
        </View>
        <Button label={r.open} variant="outline" onPress={() => setOpen(true)} />
      </Card>

      <Sheet visible={open} title={r.open} onClose={() => !busy && setOpen(false)}>
        <ThemedText type="small" themeColor="textSecondary">
          {r.body}
        </ThemedText>
        {pointsNote && <Notice tone="amber">{pointsNote}</Notice>}
        <Field label={`${r.reason} *`}>
          <View style={styles.pills}>
            {RETURN_REASONS.map((key) => (
              <Pill key={key} label={r.reasons[key]} selected={reason === key} onPress={() => setReason(key)} />
            ))}
          </View>
        </Field>
        <Field label={`${r.files} *`} hint={fill(r.filesHint, { files: RETURN_RULES.maxFiles, mb: Math.round(RETURN_RULES.videoMaxBytes / (1024 * 1024)) })}>
          <View style={styles.pills}>
            {files.map((f, i) => (
              <View key={f.uri} style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                {f.video ? <Icon name="video" size={28} color={theme.textSecondary} /> : <Image source={f.uri} style={StyleSheet.absoluteFill} contentFit="cover" />}
                <Pressable accessibilityRole="button" accessibilityLabel={r.remove} disabled={busy} onPress={() => setFiles((list) => list.filter((_, j) => j !== i))} hitSlop={6} style={styles.remove}>
                  <Icon name="x" size={14} color="#ffffff" />
                </Pressable>
              </View>
            ))}
            {files.length < RETURN_RULES.maxFiles && (
              <Pressable accessibilityRole="button" accessibilityLabel={r.addFiles} disabled={busy} onPress={askAdd} style={[styles.thumb, styles.add, { borderColor: theme.primary }]}>
                <Icon name="camera" size={22} color={theme.primary} />
                <ThemedText type="caption" themeColor="primary">
                  {r.addFiles}
                </ThemedText>
              </Pressable>
            )}
          </View>
        </Field>
        <Field label={r.details}>
          <Input value={details} onChangeText={setDetails} multiline maxLength={RETURN_RULES.detailsMax} style={styles.multiline} />
        </Field>
        <Button label={busy ? fill(r.uploading, { percent: progress }) : r.send} loading={busy} onPress={() => void submit()} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  thumb: { width: 76, height: 76, borderRadius: Radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  add: { borderWidth: 1.5, borderStyle: 'dashed', gap: 2 },
  remove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  multiline: { minHeight: 80, textAlignVertical: 'top', paddingTop: Spacing.two },
});

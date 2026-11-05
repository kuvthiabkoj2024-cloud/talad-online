import { useMutation, useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ProductGrid } from '@/components/product-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { BrandGreen, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, upload, type ProductCard } from '@/lib/api';
import { fill, useI18n } from '@/lib/i18n';
import { listeningLanguage, speechRecognizer } from '@/lib/voice';

interface PhotoResult {
  items: ProductCard[];
  related: ProductCard[];
  label: string | null;
}

/**
 * Search the whole catalog (the same search as the website), by typing, by voice, or by photo
 * ("scan": products that look like it, as on the website's Search by photo). `?mode=voice` or
 * `?mode=scan` opens straight into one of them.
 */
export default function SearchScreen() {
  const theme = useTheme();
  const { t, locale } = useI18n();
  const { mode } = useLocalSearchParams<{ mode?: 'voice' | 'scan' }>();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const stopVoice = useRef<() => void>(() => {});

  const results = useQuery({
    queryKey: ['search', q],
    queryFn: () => api<{ items: ProductCard[]; total: number }>(`/products/search?${new URLSearchParams({ q, page: '1', pageSize: '40' })}`),
    enabled: q.length > 0 && !photo,
  });
  const scan = useMutation({ mutationFn: (asset: ImagePicker.ImagePickerAsset) => upload<PhotoResult>('/products/search/image', 'file', asset) });

  const search = (words: string) => {
    setPhoto(null);
    setQ(words.trim());
  };

  // ── Voice: words appear as they're heard; when the speaker stops, they're searched. ──
  async function startVoice() {
    if (listening) return stopVoice.current();
    const speech = speechRecognizer();
    if (!speech) return Alert.alert(t.search.voice, t.search.voiceUnavailable);
    const permission = await speech.requestPermissionsAsync();
    if (!permission.granted) return Alert.alert(t.search.voice, t.search.voiceDenied);
    const { lang, english } = await listeningLanguage(speech, locale);
    setVoiceNote(english ? t.search.voiceEnglishOnly : null);

    let heard = '';
    const subs = [
      speech.addListener('result', (e) => {
        heard = e.results[0]?.transcript ?? heard;
        setText(heard);
        if (e.isFinal && heard.trim()) search(heard);
      }),
      speech.addListener('error', (e) => {
        if (e.error === 'no-speech' || e.error === 'speech-timeout') setVoiceNote(t.search.voiceNoSpeech);
        else if (e.error === 'not-allowed') setVoiceNote(t.search.voiceDenied);
      }),
      speech.addListener('end', () => {
        setListening(false);
        subs.forEach((s) => s.remove());
      }),
    ];
    stopVoice.current = () => speech.stop();
    setListening(true);
    speech.start({ lang, interimResults: true, continuous: false });
  }
  // Leaving the screen stops listening.
  useEffect(() => () => stopVoice.current(), []);

  // ── Photo: take one or pick one; products that look like it. ──
  async function pickPhoto(source: 'camera' | 'library') {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert(t.search.scan, t.search.cameraDenied);
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) return;
    setPhoto(picked.assets[0]);
    scan.mutate(picked.assets[0]);
  }
  const askPhoto = () =>
    Alert.alert(t.search.scan, t.search.scanBody, [
      { text: t.search.takePhoto, onPress: () => void pickPhoto('camera') },
      { text: t.search.choosePhoto, onPress: () => void pickPhoto('library') },
      { text: t.acct.cancel, style: 'cancel' },
    ]);

  // Opened from a shortcut (`?mode=…`): start that once the screen has slid in.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !mode) return;
    const id = setTimeout(() => {
      opened.current = true;
      if (mode === 'voice') void startVoice();
      else askPhoto();
    }, 350);
    return () => clearTimeout(id);
  });

  return (
    <>
      <Stack.Screen options={{ title: t.search.title }} />
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.box, { backgroundColor: theme.card, borderColor: listening ? theme.primary : theme.border }]}>
          <Icon name="search" size={20} color={theme.textSecondary} />
          <TextInput
            autoFocus={!mode}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => search(text)}
            placeholder={t.searchPlaceholder}
            placeholderTextColor={theme.textSecondary}
            returnKeyType="search"
            style={[styles.input, { color: theme.text }]}
          />
          {text.length > 0 && (
            <Pressable accessibilityLabel={t.common.close} onPress={() => setText('')} hitSlop={8}>
              <Icon name="close" size={20} color={theme.textSecondary} />
            </Pressable>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel={t.search.voice} onPress={() => void startVoice()} hitSlop={6} style={[styles.tool, listening && { backgroundColor: BrandGreen }]}>
            <Icon name="mic" size={20} color={listening ? '#ffffff' : theme.primary} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={t.search.scan} onPress={askPhoto} hitSlop={6} style={styles.tool}>
            <Icon name="scan" size={20} color={theme.primary} />
          </Pressable>
        </View>

        {listening && (
          <Pressable onPress={() => stopVoice.current()}>
            <Card style={styles.listening}>
              <View style={[styles.micPulse, { backgroundColor: theme.primarySoft }]}>
                <Icon name="mic" size={30} color={theme.primary} />
              </View>
              <ThemedText type="smallBold" style={styles.center}>
                {t.search.listening}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {t.search.tapToStop}
              </ThemedText>
            </Card>
          </Pressable>
        )}
        {voiceNote && !listening && (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
            {voiceNote}
          </ThemedText>
        )}

        {photo ? (
          <>
            <Card style={styles.photoCard}>
              <Image source={photo.uri} style={styles.photo} contentFit="cover" />
              <View style={styles.flex}>
                {scan.isPending ? (
                  <View style={styles.inline}>
                    <ActivityIndicator color={theme.primary} />
                    <ThemedText type="small">{t.search.scanning}</ThemedText>
                  </View>
                ) : (
                  scan.data?.label && <ThemedText type="smallBold">{fill(t.search.looksLike, { label: scan.data.label })}</ThemedText>
                )}
                <Button label={t.search.again} icon="camera" variant="outline" onPress={askPhoto} style={styles.again} />
              </View>
            </Card>
            {scan.isError && <LoadError onRetry={() => scan.mutate(photo)} />}
            {scan.data &&
              (scan.data.items.length ? (
                <>
                  <ThemedText type="subtitle">{t.search.matches}</ThemedText>
                  <ProductGrid products={scan.data.items} />
                </>
              ) : scan.data.related.length ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t.search.relatedHint}
                </ThemedText>
              ) : (
                <EmptyState icon="scan" title={t.search.noMatch} body={t.search.noMatchHint} />
              ))}
            {!!scan.data?.related.length && (
              <>
                <ThemedText type="subtitle">{t.search.related}</ThemedText>
                <ProductGrid products={scan.data.related} />
              </>
            )}
          </>
        ) : (
          <>
            {results.isFetching && !results.data && <Loading />}
            {results.isError && <LoadError onRetry={() => void results.refetch()} />}
            {results.data &&
              (results.data.items.length ? (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    {fill(t.search.results, { n: results.data.total })}
                  </ThemedText>
                  <ProductGrid products={results.data.items} />
                </>
              ) : (
                <EmptyState icon="search" title={fill(t.search.noResults, { q })} body={t.search.noResultsBody} />
              ))}
            {/* Nothing typed yet: the two other ways to search. */}
            {!q && !listening && (
              <View style={styles.ways}>
                <Pressable onPress={() => void startVoice()} style={styles.flex}>
                  {({ pressed }) => (
                    <Card style={[styles.way, pressed && styles.pressed]}>
                      <View style={[styles.wayIcon, { backgroundColor: theme.primarySoft }]}>
                        <Icon name="mic" size={26} color={theme.primary} />
                      </View>
                      <ThemedText type="smallBold" style={styles.center}>
                        {t.search.voice}
                      </ThemedText>
                    </Card>
                  )}
                </Pressable>
                <Pressable onPress={askPhoto} style={styles.flex}>
                  {({ pressed }) => (
                    <Card style={[styles.way, pressed && styles.pressed]}>
                      <View style={[styles.wayIcon, { backgroundColor: theme.primarySoft }]}>
                        <Icon name="scan" size={26} color={theme.primary} />
                      </View>
                      <ThemedText type="smallBold" style={styles.center}>
                        {t.search.scan}
                      </ThemedText>
                    </Card>
                  )}
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pressed: { opacity: 0.8 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  box: {
    height: 50,
    borderRadius: Radius.full,
    borderWidth: 1,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.one,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // 16px text so iPhones don't zoom in on it (web build).
  input: { flex: 1, fontSize: 16, paddingVertical: 0, fontFamily: FontFamily.regular },
  tool: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  listening: { alignItems: 'center', gap: Spacing.two, padding: Spacing.four },
  micPulse: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  photoCard: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three, alignItems: 'center' },
  photo: { width: 96, height: 96, borderRadius: Radius.md },
  again: { marginTop: Spacing.two, minHeight: 40 },
  ways: { flexDirection: 'row', gap: Spacing.three },
  way: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.four, paddingHorizontal: Spacing.two },
  wayIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});

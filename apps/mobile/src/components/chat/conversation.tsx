import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder, type AudioSource, type RecordingOptions } from 'expo-audio';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, type ScrollViewInstance, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { LoadError, Loading } from '@/components/ui';
import { BrandGreen, FontFamily, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, API_URL, ApiError, getApiToken, SITE_URL, upload, type ChatProductRef, type ShopChatMessage, type ShopThread } from '@/lib/api';
import { money } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';
import { shrinkPhoto } from '@/lib/shrink-photo';

/** A chat as either side reads it: the shop's view names the customer instead of the shop. */
type ChatThread = Omit<ShopThread, 'shop'> & { shop?: ShopThread['shop']; customer?: { name: string } };

export type ChatSide = 'customer' | 'shop';

/** Where each side reads and writes its chats (customer: `me/conversations`, shop: `me/shop/conversations`). */
export const chatBase = (side: ChatSide) => (side === 'shop' ? '/me/shop/conversations' : '/me/conversations');
/** Query keys per side, so the customer's and the shop's chats never mix. */
export const chatKeys = (side: ChatSide) => ({
  list: side === 'shop' ? (['seller', 'conversations'] as const) : (['me', 'conversations'] as const),
  thread: (id: string) => (side === 'shop' ? (['seller', 'conversation', id] as const) : (['me', 'conversation', id] as const)),
});

/** Voice messages: mono AAC (.m4a; WebM in a browser), about half a megabyte a minute. */
const VOICE: RecordingOptions = { ...RecordingPresets.HIGH_QUALITY, numberOfChannels: 1, bitRate: 64_000 };
/** The API takes up to a minute of speech; shorter than this is a slip of the finger. */
const VOICE_MAX_MS = 60_000;
const VOICE_MIN_MS = 800;

const clock = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/**
 * One private chat, as on the website and the Seller Center: text, photos, voice messages and
 * locations both ways, the shop's auto-replies and the products it shows. The `+` opens the
 * attachments (camera, gallery, location); the right button records a voice message while the
 * box is empty and sends once something is typed. New messages are checked every few seconds.
 * `side`: the customer chatting with a shop, or the shop answering a customer.
 */
export function Conversation({ side }: { side: ChatSide }) {
  // `product` (customers): asking about a product from its page: shown above the box, sent with the message.
  const { id, product: productId, order: orderNumber } = useLocalSearchParams<{ id: string; product?: string; order?: string }>();
  const base = chatBase(side);
  const keys = chatKeys(side);
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { t, locale } = useI18n();
  // `order` (customers): asking about an order from its page starts the message with its number.
  const [text, setText] = useState(() => (orderNumber ? fill(t.msg.aboutOrder, { number: orderNumber.slice(0, 40) }) : ''));
  const [sending, setSending] = useState(false);
  const [menu, setMenu] = useState(false);
  const recorder = useAudioRecorder(VOICE);
  // When the current voice message started (null: not recording), and a clock for its timer.
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [attachProduct, setAttachProduct] = useState(side === 'customer' && !!productId);
  const asked = useQuery({
    queryKey: [...keys.thread(id), 'product', productId],
    queryFn: () => api<ChatProductRef>(`${base}/${id}/products/${productId}`),
    enabled: !!productId && attachProduct,
  });
  const attached = attachProduct ? asked.data : undefined;
  const scroller = useRef<ScrollViewInstance>(null);
  const thread = useQuery({ queryKey: keys.thread(id), queryFn: () => api<ChatThread>(`${base}/${id}`), refetchInterval: 4000 });

  // Opening the chat (and each new message while it's open) marks it read.
  const newest = thread.data?.messages.at(-1)?.id;
  useEffect(() => {
    if (!newest) return;
    void api(`${base}/${id}/read`, { method: 'POST' })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: keys.list });
        if (side === 'shop') void queryClient.invalidateQueries({ queryKey: ['seller', 'unread'] });
      })
      .catch(() => {});
  }, [id, newest, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.thread(id) });

  async function send() {
    const body = text.trim();
    if ((!body && !attached) || sending) return;
    setSending(true);
    try {
      await api(`${base}/${id}/messages`, { method: 'POST', body: { ...(body && { text: body }), ...(attached && { productId: attached.id }) } });
      setText('');
      setAttachProduct(false);
      await refresh();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.msg.error);
    } finally {
      setSending(false);
    }
  }

  /** Runs one send (photo, voice, location), then reloads the chat. */
  async function submit(task: () => Promise<unknown>) {
    setSending(true);
    try {
      await task();
      await refresh();
    } catch (e) {
      Alert.alert(e instanceof ApiError ? e.message : t.msg.error);
    } finally {
      setSending(false);
    }
  }

  async function sendPhoto(source: 'camera' | 'library') {
    setMenu(false);
    if (source === 'camera' && !(await ImagePicker.requestCameraPermissionsAsync()).granted) return Alert.alert(t.msg.cameraDenied);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
    const picked = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (picked.canceled || !picked.assets[0]) return;
    const caption = text.trim();
    await submit(async () => {
      // iPhone photos are HEIC: converted to JPEG (and made smaller) first.
      await upload(`${base}/${id}/messages`, 'photo', await shrinkPhoto(picked.assets[0]!), caption ? { text: caption } : {});
      setText('');
    });
  }

  function askLocation() {
    setMenu(false);
    Alert.alert(t.msg.shareLocation, t.msg.locationConfirm, [
      { text: t.msg.cancel, style: 'cancel' },
      { text: t.msg.send, onPress: () => void sendLocation() },
    ]);
  }

  async function sendLocation() {
    if (!(await Location.requestForegroundPermissionsAsync()).granted) return Alert.alert(t.msg.locationDenied);
    await submit(async () => {
      const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await api(`${base}/${id}/messages`, { method: 'POST', body: { latitude: coords.latitude, longitude: coords.longitude } });
    });
  }

  async function startRecording() {
    setMenu(false);
    if (!(await requestRecordingPermissionsAsync()).granted) return Alert.alert(t.msg.micDenied);
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: VOICE_MAX_MS / 1000 });
      const start = Date.now();
      setNow(start);
      setRecordingSince(start);
    } catch {
      Alert.alert(t.msg.error);
    }
  }

  /** Stops the recorder; `send` uploads what was said, otherwise it's thrown away. */
  async function stopRecording(send: boolean) {
    if (recordingSince === null) return;
    const ms = Math.min(VOICE_MAX_MS, Date.now() - recordingSince);
    setRecordingSince(null);
    try {
      await recorder.stop();
    } catch {
      // Already stopped at the time limit.
    }
    // Back to playback mode, so voice messages play through the speaker.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    if (!send || !uri || ms < VOICE_MIN_MS) return;
    const web = Platform.OS === 'web';
    await submit(() =>
      upload(`${base}/${id}/messages`, 'audio', { uri, mimeType: web ? 'audio/webm' : 'audio/mp4', fileName: web ? 'voice.webm' : 'voice.m4a' }, { audioMs: String(Math.round(ms)) }),
    );
  }

  // The recording timer; at the one-minute limit the message goes as it is.
  useEffect(() => {
    if (recordingSince === null) return;
    const tick = setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at - recordingSince >= VOICE_MAX_MS) {
        clearInterval(tick);
        void stopRecording(true);
      }
    }, 250);
    return () => clearInterval(tick);
  }, [recordingSince]); // eslint-disable-line react-hooks/exhaustive-deps

  const recording = recordingSince !== null;
  const canSend = !!text.trim() || !!attached;

  // The other side: the shop (for the customer) or the customer (for the shop).
  const other = side === 'shop' ? thread.data?.customer?.name : thread.data?.shop?.name;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0} style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: other ?? t.msg.title }} />
      {thread.isPending && <Loading />}
      {thread.isError && (
        <View style={styles.pad}>
          <LoadError onRetry={() => void thread.refetch()} />
        </View>
      )}
      {thread.data && (
        <ScrollView ref={scroller} contentContainerStyle={styles.thread} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
            🔒 {fill(t.msg.private, { shop: other ?? '' })}
          </ThemedText>
          {thread.data.messages.map((m) => (
            <Bubble key={m.id} m={m} side={side} conversationId={id} shopName={other ?? ''} locale={locale} />
          ))}
        </ScrollView>
      )}
      {attached && (
        <View style={[styles.attached, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <View style={[styles.attachedImg, { backgroundColor: theme.backgroundElement }]}>
            {attached.imageUrl && <Image source={attached.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}
          </View>
          <View style={styles.flex}>
            <ThemedText type="caption" themeColor="textSecondary">
              {t.msg.askAbout}
            </ThemedText>
            <ThemedText type="small" numberOfLines={1}>
              {attached.name}
            </ThemedText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t.msg.removeProduct} onPress={() => setAttachProduct(false)} hitSlop={8}>
            <Icon name="x" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>
      )}
      {menu && !recording && (
        <Animated.View entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(140)} style={[styles.menu, { backgroundColor: theme.card, borderTopColor: theme.border }]}>
          <AttachOption icon="camera" label={t.msg.camera} tint="#e91e63" onPress={() => void sendPhoto('camera')} />
          <AttachOption icon="image" label={t.msg.gallery} tint="#7c4dff" onPress={() => void sendPhoto('library')} />
          <AttachOption icon="location" label={t.msg.shareLocation} tint={BrandGreen} onPress={askLocation} />
        </Animated.View>
      )}
      <View style={[styles.composer, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
        {recording ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel={t.msg.cancel} onPress={() => void stopRecording(false)} style={[styles.round, { backgroundColor: theme.backgroundElement }]}>
              <Icon name="trash" size={20} color={theme.sale} />
            </Pressable>
            <View style={[styles.recording, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <View style={[styles.dot, { opacity: Math.floor((now - recordingSince) / 500) % 2 ? 0.3 : 1 }]} />
              <ThemedText type="smallBold">{clock(now - recordingSince)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
                {t.msg.recording}
              </ThemedText>
              <ThemedText type="caption" themeColor="textSecondary">
                {clock(VOICE_MAX_MS)}
              </ThemedText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t.msg.send} onPress={() => void stopRecording(true)} style={[styles.round, { backgroundColor: BrandGreen }]}>
              <Icon name="send" size={20} color="#ffffff" />
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t.msg.more}
              accessibilityState={{ expanded: menu }}
              disabled={sending}
              onPress={() => setMenu((open) => !open)}
              style={[styles.round, { backgroundColor: theme.backgroundElement }]}>
              <View style={{ transform: [{ rotate: menu ? '45deg' : '0deg' }] }}>
                <Icon name="add" size={24} color={menu ? theme.primary : theme.textSecondary} />
              </View>
            </Pressable>
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => setMenu(false)}
              placeholder={side === 'shop' ? t.msg.placeholderShop : t.msg.placeholder}
              placeholderTextColor={theme.textSecondary}
              multiline
              style={[styles.input, { color: theme.text, backgroundColor: theme.background, borderColor: theme.border }]}
            />
            {sending ? (
              <View style={[styles.round, { backgroundColor: theme.backgroundElement }]}>
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : canSend ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t.msg.send} onPress={() => void send()} style={[styles.round, { backgroundColor: BrandGreen }]}>
                <Icon name="send" size={20} color="#ffffff" />
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel={t.msg.record} onPress={() => void startRecording()} style={[styles.round, { backgroundColor: BrandGreen }]}>
                <Icon name="mic" size={22} color="#ffffff" />
              </Pressable>
            )}
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ m, side, conversationId, shopName, locale }: { m: ShopChatMessage; side: ChatSide; conversationId: string; shopName: string; locale: 'lo' | 'en' }) {
  const theme = useTheme();
  const { t } = useI18n();
  const token = getApiToken();

  if (m.system)
    return (
      <View style={[styles.system, { backgroundColor: theme.backgroundElement }]}>
        <ThemedText type="caption" themeColor="textSecondary" style={styles.center}>
          {m.text}
        </ThemedText>
      </View>
    );

  return (
    <View style={[styles.turn, m.mine ? styles.mineTurn : styles.theirTurn]}>
      {m.bot && (
        <ThemedText type="caption" themeColor="textSecondary">
          🤖 {t.msg.autoReply}
        </ThemedText>
      )}
      {m.hasPhoto && (
        <Image
          source={{ uri: `${API_URL}${chatBase(side)}/${conversationId}/messages/${m.id}/photo`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
          style={[styles.photo, { backgroundColor: theme.backgroundElement }]}
          contentFit="cover"
        />
      )}
      {m.product && <ProductRef p={m.product} />}
      {m.audio && (
        <VoiceBubble
          source={{ uri: `${API_URL}${chatBase(side)}/${conversationId}/messages/${m.id}/audio`, headers: token ? { Authorization: `Bearer ${token}` } : undefined }}
          ms={m.audio.ms}
          mine={m.mine}
        />
      )}
      {!!m.text && (
        <View style={[styles.bubble, m.mine ? { backgroundColor: BrandGreen, borderBottomRightRadius: 4 } : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 4 }]}>
          <ThemedText type="small" style={m.mine ? styles.white : undefined}>
            {m.text}
          </ThemedText>
        </View>
      )}
      {m.location && (
        <Pressable onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${m.location!.lat},${m.location!.lng}`)}>
          <View style={[styles.bubble, { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
            <ThemedText type="smallBold" themeColor="primary">
              {t.msg.location}
            </ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {t.msg.openMap}
            </ThemedText>
          </View>
        </Pressable>
      )}
      {m.order != null && side === 'shop' && (
        <View style={[styles.bubble, { backgroundColor: theme.primarySoft }]}>
          <ThemedText type="small" themeColor="primary">
            {t.msg.order}
          </ThemedText>
        </View>
      )}
      {m.order != null && side === 'customer' && (
        <Pressable onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/${locale}/messages/${conversationId}`)}>
          <View style={[styles.bubble, { backgroundColor: theme.primarySoft }]}>
            <ThemedText type="small" themeColor="primary">
              {t.msg.orderCard}
            </ThemedText>
          </View>
        </Pressable>
      )}
      {m.products.map((p) => (
        <ProductRef key={p.id} p={p} />
      ))}
      <ThemedText type="caption" themeColor="textSecondary" accessibilityLabel={shopName}>
        {new Date(m.createdAt).toLocaleTimeString(locale === 'lo' ? 'lo-LA' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
      </ThemedText>
    </View>
  );
}

/** One option in the `+` menu: a coloured round icon over its name, as in WhatsApp. */
function AttachOption({ icon, label, tint, onPress }: { icon: IconName; label: string; tint: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.option}>
      <View style={[styles.optionIcon, { backgroundColor: tint }]}>
        <Icon name={icon} size={24} color="#ffffff" />
      </View>
      <ThemedText type="caption">{label}</ThemedText>
    </Pressable>
  );
}

/**
 * A voice message: play/pause, a progress bar and its length. The sound is only fetched on the
 * first tap, so a long chat doesn't download every recording up front.
 */
function VoiceBubble({ source, ms, mine }: { source: AudioSource; ms: number; mine: boolean }) {
  const theme = useTheme();
  const { t } = useI18n();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loaded, setLoaded] = useState(false);
  const total = status.duration > 0 ? status.duration : ms / 1000;
  const progress = loaded && total > 0 ? Math.min(1, status.currentTime / total) : 0;
  const ink = mine ? '#ffffff' : theme.primary;

  async function toggle() {
    if (status.playing) return player.pause();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    if (!loaded) {
      player.replace(source);
      setLoaded(true);
    } else if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) {
      await player.seekTo(0);
    }
    player.play();
  }

  return (
    <View style={[styles.bubble, styles.voice, mine ? { backgroundColor: BrandGreen } : { backgroundColor: theme.card, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? t.msg.pause : t.msg.play} onPress={() => void toggle()} hitSlop={8}>
        {loaded && status.isBuffering && !status.playing ? <ActivityIndicator color={ink} /> : <Icon name={status.playing ? 'pause' : 'play'} size={22} color={ink} fill={ink} />}
      </Pressable>
      <View style={[styles.track, { backgroundColor: mine ? 'rgba(255,255,255,0.35)' : theme.backgroundElement }]}>
        <View style={[styles.trackFill, { width: `${progress * 100}%`, backgroundColor: ink }]} />
      </View>
      <ThemedText type="caption" style={mine ? styles.white : undefined}>
        {clock((status.playing || progress > 0 ? status.currentTime : total) * 1000)}
      </ThemedText>
    </View>
  );
}

/** A product shared in the chat: tap to open it. */
function ProductRef({ p }: { p: ChatProductRef }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/product/${p.shopSlug}/${p.slug}`)} style={[styles.product, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.productImg, { backgroundColor: theme.backgroundElement }]}>{p.imageUrl && <Image source={p.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" />}</View>
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={2}>
          {p.name}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="primary">
          {money(p.price)}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  center: { textAlign: 'center' },
  white: { color: '#ffffff' },
  thread: { padding: Spacing.three, gap: Spacing.three },
  system: { alignSelf: 'center', borderRadius: Radius.md, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, maxWidth: '90%' },
  turn: { gap: Spacing.one, maxWidth: '82%' },
  mineTurn: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirTurn: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: Radius.lg, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  photo: { width: 220, height: 220, borderRadius: Radius.md },
  product: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.two, width: 240 },
  attached: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  attachedImg: { width: 44, height: 44, borderRadius: 8, overflow: 'hidden' },
  productImg: { width: 52, height: 52, borderRadius: 8, overflow: 'hidden' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  menu: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: Spacing.three, paddingHorizontal: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
  option: { alignItems: 'center', gap: Spacing.one, minWidth: 72 },
  optionIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  recording: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: 22, paddingHorizontal: Spacing.three },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#e53935' },
  voice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, width: 220 },
  track: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: 2 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: Spacing.three, paddingTop: 11, paddingBottom: 11, fontSize: 16, fontFamily: FontFamily.regular },
});

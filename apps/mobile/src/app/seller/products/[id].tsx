import {
  customerGuarantee,
  DEPOSIT_RULES,
  DEPOSIT_TYPES,
  GUARANTEE_RULES,
  GUARANTEE_UNITS,
  MEDIA_LIMITS,
  PRICE_TIER_RULES,
  PRODUCT_RULES,
  priceTierProblem,
  type DepositType,
  type GuaranteeUnit,
  type PriceTier,
  type ProductSaveIntent,
  type ProductStatus,
} from '@talad/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field, Input, Select } from '@/components/form';
import { Icon } from '@/components/icon';
import { sellerStyles } from '@/components/seller/ui';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, LoadError, Loading } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, localized, upload, type CategoryNode, type LocalizedText } from '@/lib/api';
import { fill } from '@/lib/i18n';
import { autoSku, blankCell, combinations, comboKey, randomSku, type OptionGroup, type VariantCell } from '@/lib/product-options';
import { useSellerI18n } from '@/lib/seller-i18n';
import { shrinkPhoto } from '@/lib/shrink-photo';
import { uploadWithProgress } from '@/lib/video';

/** Mirrors `ShopProductDetail` (services/api catalog/products). */
interface ShopProductDetail {
  id: string;
  status: ProductStatus;
  rejectionReason: string | null;
  name: string;
  description: string | null;
  categoryId: string;
  unitId: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  priceTiers: PriceTier[];
  guarantee: { duration: number; unit: GuaranteeUnit; terms: string | null } | null;
  deposit: { type: DepositType; value: number } | null;
  stock: number;
  lowStockThreshold: number;
  images: { key: string; url: string }[];
  video: { key: string; url: string } | null;
  options: { name: string; values: string[] }[];
  variants: { id: string; attributes: Record<string, string>; sku: string; price: number | null; stock: number }[];
}

type Media = { uid: string; key?: string; url: string };
type TierRow = { uid: string; minQuantity: string; price: string };
const uid = () => Math.random().toString(36).slice(2);
const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/,/g, '')));
const isWhole = (v: string) => /^\d+$/.test(v.trim());

/** Create (`/seller/products/new`) or edit a product, as the Seller Center's editor (§3.3). */
export default function SellerProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const theme = useTheme();
  const { s } = useSellerI18n();
  const product = useQuery({ queryKey: ['seller', 'product', id], queryFn: () => api<ShopProductDetail>(`/me/shop/products/${id}`), enabled: !isNew });
  const title = isNew ? s.editor.newTitle : s.editor.editTitle;
  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title }} />
      {!isNew && product.isPending ? (
        <Loading />
      ) : !isNew && product.isError ? (
        <View style={styles.pad}>
          <LoadError onRetry={() => void product.refetch()} />
        </View>
      ) : (
        <Editor key={id} product={product.data} />
      )}
    </View>
  );
}

function Editor({ product }: { product?: ShopProductDetail }) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { s, locale } = useSellerI18n();
  const e = s.editor;
  const categories = useQuery({ queryKey: ['categories'], queryFn: () => api<CategoryNode[]>('/categories'), staleTime: Infinity });
  const units = useQuery({ queryKey: ['units'], queryFn: () => api<{ id: string; name: LocalizedText }[]>('/units'), staleTime: Infinity });
  const profile = useQuery({ queryKey: ['seller', 'profile'], queryFn: () => api<{ cod: { enabled: boolean }; payment: { hasQr: boolean } }>('/me/shop/profile') });

  const [name, setName] = useState(product?.name ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [unitId, setUnitId] = useState(product?.unitId ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [price, setPrice] = useState(product ? String(product.price) : '');
  const [compareAt, setCompareAt] = useState(product?.compareAtPrice != null ? String(product.compareAtPrice) : '');
  const [stock, setStock] = useState(product ? String(product.stock) : '0');
  const [lowStock, setLowStock] = useState(product ? String(product.lowStockThreshold) : '5');
  const [images, setImages] = useState<Media[]>(() => product?.images.map((i) => ({ uid: i.key, key: i.key, url: i.url })) ?? []);
  const [video, setVideo] = useState<Media | null>(product?.video ? { uid: product.video.key, key: product.video.key, url: product.video.url } : null);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [bulkOn, setBulkOn] = useState((product?.priceTiers.length ?? 0) > 0);
  const [tiers, setTiers] = useState<TierRow[]>(() => product?.priceTiers.map((t) => ({ uid: uid(), minQuantity: String(t.minQuantity), price: String(t.price) })) ?? []);
  const [hasOptions, setHasOptions] = useState((product?.variants.length ?? 0) > 0);
  const [options, setOptions] = useState<OptionGroup[]>(() => product?.options.map((o) => ({ uid: uid(), name: o.name, values: [...o.values] })) ?? []);
  const [cells, setCells] = useState<Record<string, VariantCell>>(() =>
    Object.fromEntries(
      (product?.variants ?? []).map((v) => [
        comboKey((product?.options ?? []).map((o) => v.attributes[o.name] ?? '')),
        { id: v.id, sku: v.sku, autoSku: false, price: v.price != null ? String(v.price) : '', stock: String(v.stock) },
      ]),
    ),
  );
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({});
  const [guaranteeOn, setGuaranteeOn] = useState(!!product?.guarantee);
  const [gDuration, setGDuration] = useState(product?.guarantee ? String(product.guarantee.duration) : '');
  const [gUnit, setGUnit] = useState<GuaranteeUnit>(product?.guarantee?.unit ?? 'MONTH');
  const [gTerms, setGTerms] = useState(product?.guarantee?.terms ?? '');
  const [depositOn, setDepositOn] = useState(!!product?.deposit);
  const [depositType, setDepositType] = useState<DepositType>(product?.deposit?.type ?? 'PERCENT');
  const [depositValue, setDepositValue] = useState(product?.deposit ? String(product.deposit.value) : '');
  const [saving, setSaving] = useState<ProductSaveIntent | null>(null);

  const combos = combinations(options);
  const filled = options.filter((o) => o.values.length);
  const cellFor = (values: string[]): VariantCell => cells[comboKey(values)] ?? blankCell();
  const skuFor = (values: string[]) => {
    const c = cellFor(values);
    return (c.autoSku ? autoSku(sku, values) : c.sku).trim();
  };
  const setCell = (values: string[], patch: Partial<VariantCell>) => setCells((all) => ({ ...all, [comboKey(values)]: { ...cellFor(values), ...patch } }));
  const uploading = images.some((i) => !i.key) || (video !== null && !video.key);

  const categoryOptions = (categories.data ?? []).flatMap((c) => [
    { value: c.id, label: localized(c.name, locale) },
    ...c.children.map((child) => ({ value: child.id, label: `${localized(c.name, locale)} › ${localized(child.name, locale)}` })),
  ]);

  async function addPhotos(from: 'camera' | 'gallery') {
    const room = MEDIA_LIMITS.maxImagesPerProduct - images.length;
    if (room <= 0) return Alert.alert(fill(e.errors.tooManyImages, { max: MEDIA_LIMITS.maxImagesPerProduct }));
    const permission = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(s.orders.cameraDenied);
    const res =
      from === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsMultipleSelection: true, selectionLimit: room });
    if (res.canceled) return;
    for (const asset of res.assets.slice(0, room)) {
      const item: Media = { uid: uid(), url: asset.uri };
      setImages((list) => [...list, item]);
      try {
        const file = await shrinkPhoto(asset, 2000);
        const saved = await upload<{ key: string; url: string }>('/me/shop/products/images', 'file', file);
        setImages((list) => list.map((m) => (m.uid === item.uid ? { uid: item.uid, key: saved.key, url: saved.url } : m)));
      } catch (err) {
        setImages((list) => list.filter((m) => m.uid !== item.uid));
        Alert.alert(errorText(err));
      }
    }
  }

  async function pickVideo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert(s.orders.cameraDenied);
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      videoMaxDuration: MEDIA_LIMITS.maxVideoSeconds,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    if (asset.duration && asset.duration > (MEDIA_LIMITS.maxVideoSeconds + 1) * 1000) return Alert.alert(e.errors.videoLength);
    const item: Media = { uid: uid(), url: asset.uri };
    setVideo(item);
    setVideoProgress(0);
    try {
      const saved = await uploadWithProgress<{ key: string; url: string }>(
        '/me/shop/products/video',
        {},
        { uri: asset.uri, name: asset.fileName ?? 'video.mp4', type: asset.mimeType ?? 'video/mp4' },
        setVideoProgress,
      );
      setVideo({ uid: item.uid, key: saved.key, url: saved.url });
    } catch (err) {
      setVideo(null);
      Alert.alert(errorText(err));
    } finally {
      setVideoProgress(null);
    }
  }

  function errorText(err: unknown): string {
    const code = err instanceof ApiError ? err.code : undefined;
    return (code && (e.errors as Record<string, string>)[code]) || s.common.saveError;
  }

  /** The first problem in the form, as the Seller Center checks it before saving. */
  function problem(intent: ProductSaveIntent): string | null {
    if (!name.trim()) return e.errors.name;
    if (!categoryId) return e.errors.category;
    if (!unitId) return e.errors.unit;
    if (!(num(price) >= 0)) return e.errors.price;
    if (compareAt.trim() && !(num(compareAt) > num(price))) return e.errors.compareAt;
    if (!PRODUCT_RULES.skuPattern.test(sku.trim())) return e.errors.sku;
    if (!isWhole(lowStock)) return e.errors.stock;
    if (bulkOn) {
      const rows = tiers.filter((r) => r.minQuantity.trim() || r.price.trim());
      const p = priceTierProblem(num(price), rows.map((r) => ({ minQuantity: num(r.minQuantity), price: num(r.price) })));
      if (p) return { quantity: e.errors.tierQuantity, quantityOrder: e.errors.tierQuantityOrder, price: e.errors.tierPrice, priceOrder: e.errors.tierPriceOrder, tooMany: e.errors.tierQuantity }[p];
    }
    if (guaranteeOn && !(isWhole(gDuration) && num(gDuration) >= 1 && num(gDuration) <= GUARANTEE_RULES.durationMax)) return e.errors.guarantee;
    if (depositOn && !(num(depositValue) >= 1 && (depositType === 'AMOUNT' || num(depositValue) <= DEPOSIT_RULES.percentMax))) return e.errors.deposit;
    if (hasOptions) {
      if (options.some((o) => !o.name.trim())) return e.errors.optionName;
      if (!options.length || options.some((o) => !o.values.length)) return e.errors.optionValues;
      const names = options.map((o) => o.name.trim().toLowerCase());
      if (new Set(names).size !== names.length) return e.errors.optionsDuplicate;
      if (combos.length > PRODUCT_RULES.maxVariants) return e.errors.tooManyVariants;
      for (const values of combos) {
        const c = cellFor(values);
        if (!PRODUCT_RULES.skuPattern.test(skuFor(values))) return e.errors.sku;
        if (c.price.trim() && !(num(c.price) >= 0)) return e.errors.price;
        if (!isWhole(c.stock)) return e.errors.stock;
      }
      const skus = [sku, ...combos.map(skuFor)].map((x) => x.trim().toLowerCase());
      if (new Set(skus).size !== skus.length) return e.errors.optionsDuplicate;
    } else if (!isWhole(stock)) return e.errors.stock;
    if (intent === 'publish' && images.length === 0) return e.errors.images;
    return null;
  }

  async function save(intent: ProductSaveIntent) {
    if (uploading) return Alert.alert(e.unsavedUploads);
    const wrong = problem(intent);
    if (wrong) return Alert.alert(wrong);
    const withOptions = hasOptions && combos.length > 0;
    const body = {
      intent,
      name: name.trim(),
      description: description.trim() || undefined,
      categoryId,
      unitId,
      sku: sku.trim(),
      price: num(price),
      compareAtPrice: compareAt.trim() ? num(compareAt) : null,
      priceTiers: bulkOn ? tiers.filter((r) => r.minQuantity.trim() || r.price.trim()).map((r) => ({ minQuantity: num(r.minQuantity), price: num(r.price) })) : [],
      guarantee: guaranteeOn ? { duration: num(gDuration), unit: gUnit, terms: gTerms.trim() || undefined } : null,
      deposit: depositOn ? { type: depositType, value: num(depositValue) } : null,
      stock: withOptions ? 0 : Number(stock),
      lowStockThreshold: Number(lowStock),
      imageKeys: images.map((i) => i.key!),
      videoKey: video?.key ?? null,
      options: withOptions ? filled.map((o) => ({ name: o.name.trim(), values: o.values })) : undefined,
      variants: withOptions
        ? combos.map((values) => {
            const c = cellFor(values);
            return {
              id: c.id,
              attributes: Object.fromEntries(filled.map((o, i) => [o.name.trim(), values[i]])),
              sku: skuFor(values),
              price: c.price.trim() ? num(c.price) : null,
              stock: Number(c.stock),
            };
          })
        : [],
    };
    setSaving(intent);
    try {
      const saved = await api<ShopProductDetail>(product ? `/me/shop/products/${product.id}` : '/me/shop/products', { method: product ? 'PUT' : 'POST', body });
      queryClient.setQueryData(['seller', 'product', saved.id], saved);
      void queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
      void queryClient.invalidateQueries({ queryKey: ['seller', 'summary'] });
      Alert.alert(saved.status === 'PUBLISHED' ? e.savedPublished : saved.status === 'PENDING' ? e.savedPending : e.savedDraft);
      router.back();
    } catch (err) {
      Alert.alert(errorText(err));
    } finally {
      setSaving(null);
    }
  }

  function remove() {
    if (!product) return;
    Alert.alert(s.products.deleteTitle, fill(s.products.deleteBody, { name: product.name }), [
      { text: s.common.cancel, style: 'cancel' },
      {
        text: e.remove,
        style: 'destructive',
        onPress: () =>
          void api(`/me/shop/products/${product.id}`, { method: 'DELETE' })
            .then(() => {
              void queryClient.invalidateQueries({ queryKey: ['seller', 'products'] });
              Alert.alert(s.products.deleted);
              router.back();
            })
            .catch((err) => Alert.alert(err instanceof ApiError && err.code === 'PRODUCT_HAS_ORDERS' ? s.products.hasOrders : s.common.saveError)),
      },
    ]);
  }

  const switchRow = (label: string, hint: string | undefined, value: boolean, onChange: (v: boolean) => void) => (
    <View style={styles.switchRow}>
      <View style={styles.flex}>
        <ThemedText type="smallBold">{label}</ThemedText>
        {hint && (
          <ThemedText type="caption" themeColor="textSecondary">
            {hint}
          </ThemedText>
        )}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.primary }} />
    </View>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        {product?.status === 'REJECTED' && product.rejectionReason && (
          <Notice tone="danger">{fill(e.rejectedNote, { reason: product.rejectionReason })}</Notice>
        )}
        {product?.status === 'PENDING' && <Notice>{e.pendingNote}</Notice>}
        {!product && <Notice>{e.moderationNote}</Notice>}

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{e.photos}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {fill(e.photosHint, { max: MEDIA_LIMITS.maxImagesPerProduct })}
          </ThemedText>
          <View style={styles.photos}>
            {images.map((m, i) => (
              <View key={m.uid} style={[styles.photo, { backgroundColor: theme.backgroundElement }]}>
                <Image source={m.url} style={StyleSheet.absoluteFill} contentFit="cover" />
                {!m.key && <ActivityIndicator style={StyleSheet.absoluteFill} color="#ffffff" />}
                {i === 0 && (
                  <View style={[styles.cover, { backgroundColor: theme.primary }]}>
                    <ThemedText style={styles.coverText}>{e.cover}</ThemedText>
                  </View>
                )}
                <View style={styles.photoActions}>
                  {i > 0 && (
                    <Pressable accessibilityLabel={e.moveLeft} onPress={() => setImages((l) => swap(l, i, i - 1))} style={styles.photoBtn} hitSlop={4}>
                      <Icon name="back" size={12} color="#ffffff" />
                    </Pressable>
                  )}
                  <Pressable accessibilityLabel={e.remove} onPress={() => setImages((l) => l.filter((x) => x.uid !== m.uid))} style={styles.photoBtn} hitSlop={4}>
                    <Icon name="x" size={12} color="#ffffff" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.row}>
            <Button label={s.orders.takePhoto} icon="camera" variant="outline" onPress={() => void addPhotos('camera')} style={styles.flex} />
            <Button label={s.orders.fromGallery} icon="image" variant="outline" onPress={() => void addPhotos('gallery')} style={styles.flex} />
          </View>
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{e.video}</ThemedText>
          <ThemedText type="caption" themeColor="textSecondary">
            {fill(e.videoHint, { seconds: MEDIA_LIMITS.maxVideoSeconds })}
          </ThemedText>
          {video && <VideoPreview url={video.url} />}
          {videoProgress !== null && (
            <ThemedText type="caption" themeColor="primary">
              {fill(e.uploading, { pct: Math.round(videoProgress * 100) })}
            </ThemedText>
          )}
          <View style={styles.row}>
            <Button label={video ? e.replaceVideo : e.addVideo} icon="video" variant="outline" disabled={videoProgress !== null} onPress={() => void pickVideo()} style={styles.flex} />
            {video && <Button label={e.remove} variant="outline" onPress={() => setVideo(null)} />}
          </View>
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{e.basics}</ThemedText>
          <Field label={e.name}>
            <Input value={name} onChangeText={setName} placeholder={e.namePlaceholder} maxLength={PRODUCT_RULES.nameMax} />
          </Field>
          <Field label={e.descriptionLabel}>
            <Input value={description} onChangeText={setDescription} placeholder={e.descriptionPlaceholder} multiline maxLength={PRODUCT_RULES.descriptionMax} style={styles.multiline} />
          </Field>
          <Field label={e.category}>
            <Select value={categoryId} placeholder={e.chooseCategory} options={categoryOptions} onChange={setCategoryId} />
          </Field>
          <Field label={e.unit}>
            <Select value={unitId} placeholder={e.chooseUnit} options={(units.data ?? []).map((u) => ({ value: u.id, label: localized(u.name, locale) }))} onChange={setUnitId} />
          </Field>
        </Card>

        <Card style={sellerStyles.card}>
          <ThemedText type="smallBold">{e.pricing}</ThemedText>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label={e.price}>
                <Input value={price} onChangeText={(v) => setPrice(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
              </Field>
            </View>
            <View style={styles.flex}>
              <Field label={e.compareAt}>
                <Input value={compareAt} onChangeText={(v) => setCompareAt(v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
              </Field>
            </View>
          </View>
          <Field label={e.sku} hint={e.skuHint}>
            <View style={styles.row}>
              <Input value={sku} onChangeText={setSku} autoCapitalize="characters" autoCorrect={false} style={styles.flex} />
              <Pressable accessibilityRole="button" accessibilityLabel={e.randomSku} onPress={() => setSku(randomSku())} style={[styles.iconBtn, { borderColor: theme.border }]}>
                <Icon name="swap" size={18} color={theme.primary} />
              </Pressable>
            </View>
          </Field>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Field label={e.stock} hint={hasOptions ? e.stockFromOptions : undefined}>
                <Input value={hasOptions ? '' : stock} editable={!hasOptions} placeholder={hasOptions ? '—' : undefined} onChangeText={(v) => setStock(v.replace(/\D/g, ''))} keyboardType="number-pad" />
              </Field>
            </View>
            <View style={styles.flex}>
              <Field label={e.lowStockAt}>
                <Input value={lowStock} onChangeText={(v) => setLowStock(v.replace(/\D/g, ''))} keyboardType="number-pad" />
              </Field>
            </View>
          </View>
        </Card>

        <Card style={sellerStyles.card}>
          {switchRow(e.bulk.title, e.bulk.hint, bulkOn, (on) => {
            setBulkOn(on);
            if (on && !tiers.length) setTiers([{ uid: uid(), minQuantity: '', price: '' }]);
          })}
          {bulkOn && (
            <>
              {tiers.map((r) => (
                <View key={r.uid} style={styles.row}>
                  <Input
                    value={r.minQuantity}
                    placeholder={e.bulk.quantity}
                    keyboardType="number-pad"
                    onChangeText={(v) => setTiers((l) => l.map((x) => (x.uid === r.uid ? { ...x, minQuantity: v.replace(/\D/g, '') } : x)))}
                    style={styles.flex}
                  />
                  <Input
                    value={r.price}
                    placeholder={e.bulk.price}
                    keyboardType="decimal-pad"
                    onChangeText={(v) => setTiers((l) => l.map((x) => (x.uid === r.uid ? { ...x, price: v.replace(/[^\d.]/g, '') } : x)))}
                    style={styles.flex}
                  />
                  <Pressable accessibilityLabel={e.bulk.remove} onPress={() => setTiers((l) => l.filter((x) => x.uid !== r.uid))} style={[styles.iconBtn, { borderColor: theme.border }]}>
                    <Icon name="trash" size={18} color={theme.textSecondary} />
                  </Pressable>
                </View>
              ))}
              {tiers.length < PRICE_TIER_RULES.maxTiers && (
                <Button label={e.bulk.add} icon="add" variant="outline" onPress={() => setTiers((l) => [...l, { uid: uid(), minQuantity: '', price: '' }])} style={styles.small} />
              )}
              {hasOptions && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {e.bulk.options}
                </ThemedText>
              )}
            </>
          )}
        </Card>

        <Card style={sellerStyles.card}>
          {switchRow(e.optionsTitle, e.optionsToggle, hasOptions, (on) => {
            setHasOptions(on);
            if (on && !options.length) setOptions([{ uid: uid(), name: e.colour, values: [] }]);
          })}
          {hasOptions && (
            <>
              {options.map((o, oi) => (
                <View key={o.uid} style={[styles.group, { borderColor: theme.border }]}>
                  <View style={styles.row}>
                    <Input value={o.name} placeholder={e.optionName} onChangeText={(v) => setOptions((l) => l.map((x) => (x.uid === o.uid ? { ...x, name: v } : x)))} style={styles.flex} />
                    <Pressable accessibilityLabel={e.removeOptionGroup} onPress={() => setOptions((l) => l.filter((x) => x.uid !== o.uid))} style={[styles.iconBtn, { borderColor: theme.border }]}>
                      <Icon name="trash" size={18} color={theme.textSecondary} />
                    </Pressable>
                  </View>
                  <View style={styles.values}>
                    {o.values.map((v) => (
                      <Pressable
                        key={v}
                        accessibilityLabel={`${e.remove} ${v}`}
                        onPress={() => setOptions((l) => l.map((x) => (x.uid === o.uid ? { ...x, values: x.values.filter((y) => y !== v) } : x)))}
                        style={[styles.value, { backgroundColor: theme.primarySoft }]}>
                        <ThemedText type="caption" themeColor="primary">
                          {v} ✕
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                  <Input
                    value={valueDraft[o.uid] ?? ''}
                    placeholder={e.valuePlaceholder}
                    returnKeyType="done"
                    blurOnSubmit={false}
                    onChangeText={(v) => setValueDraft((d) => ({ ...d, [o.uid]: v }))}
                    onSubmitEditing={() => {
                      const v = (valueDraft[o.uid] ?? '').trim();
                      if (!v || o.values.some((x) => x.toLowerCase() === v.toLowerCase()) || o.values.length >= PRODUCT_RULES.maxOptionValues) return;
                      setOptions((l) => l.map((x) => (x.uid === o.uid ? { ...x, values: [...x.values, v] } : x)));
                      setValueDraft((d) => ({ ...d, [o.uid]: '' }));
                    }}
                  />
                  {oi === 0 && !o.values.length && (
                    <View style={styles.values}>
                      {(o.name.trim().toLowerCase() === e.size.toLowerCase() ? e.sizePresets : e.colourPresets).split(',').map((v) => (
                        <Pressable
                          key={v}
                          onPress={() => setOptions((l) => l.map((x) => (x.uid === o.uid && !x.values.includes(v.trim()) ? { ...x, values: [...x.values, v.trim()] } : x)))}
                          style={[styles.value, { borderColor: theme.border, borderWidth: 1 }]}>
                          <ThemedText type="caption">+ {v.trim()}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              ))}
              {options.length < PRODUCT_RULES.maxOptions && (
                <Button label={e.addOptionGroup} icon="add" variant="outline" onPress={() => setOptions((l) => [...l, { uid: uid(), name: e.size, values: [] }])} style={styles.small} />
              )}
              {combos.length > 0 && (
                <>
                  <ThemedText type="smallBold">{e.stockTable}</ThemedText>
                  {combos.map((values) => {
                    const c = cellFor(values);
                    return (
                      <View key={comboKey(values)} style={[styles.combo, { borderColor: theme.border }]}>
                        <ThemedText type="small" style={styles.comboName} numberOfLines={1}>
                          {values.join(' · ')}
                        </ThemedText>
                        <View style={styles.row}>
                          <Input value={c.price} placeholder={e.optionPrice} keyboardType="decimal-pad" onChangeText={(v) => setCell(values, { price: v.replace(/[^\d.]/g, '') })} style={styles.flex} />
                          <Input value={c.stock} placeholder={e.stock} keyboardType="number-pad" onChangeText={(v) => setCell(values, { stock: v.replace(/\D/g, '') })} style={styles.flex} />
                        </View>
                        <Input value={skuFor(values)} autoCapitalize="characters" autoCorrect={false} onChangeText={(v) => setCell(values, { sku: v, autoSku: false })} style={styles.skuInput} />
                      </View>
                    );
                  })}
                </>
              )}
            </>
          )}
        </Card>

        <Card style={sellerStyles.card}>
          {switchRow(e.guarantee.title, e.guarantee.hint, guaranteeOn, setGuaranteeOn)}
          {guaranteeOn && (
            <>
              <View style={styles.row}>
                <Input value={gDuration} placeholder={e.guarantee.period} keyboardType="number-pad" onChangeText={(v) => setGDuration(v.replace(/\D/g, ''))} style={styles.flex} />
                <View style={styles.flex}>
                  <Select value={gUnit} placeholder={e.guarantee.period} options={GUARANTEE_UNITS.map((u) => ({ value: u, label: e.guarantee.units[u] }))} onChange={(v) => setGUnit(v as GuaranteeUnit)} />
                </View>
              </View>
              {isWhole(gDuration) && num(gDuration) >= 1 && (
                <Notice>
                  {fill(e.guarantee.doubled, {
                    entered: `${gDuration} ${e.guarantee.units[gUnit]}`,
                    given: `${customerGuarantee(num(gDuration))} ${e.guarantee.units[gUnit]}`,
                  })}
                </Notice>
              )}
              <Field label={e.guarantee.terms} hint={e.guarantee.termsHint}>
                <Input value={gTerms} onChangeText={setGTerms} multiline maxLength={GUARANTEE_RULES.termsMax} style={styles.multiline} />
              </Field>
            </>
          )}
        </Card>

        {/* Only for a shop taking cash on delivery. */}
        {profile.data?.cod.enabled && (
          <Card style={sellerStyles.card}>
            {switchRow(e.deposit.title, e.deposit.hint, depositOn, setDepositOn)}
            {depositOn && (
              <>
                {!profile.data.payment.hasQr && <Notice tone="danger">{e.errors.DEPOSIT_QR_REQUIRED}</Notice>}
                <View style={styles.row}>
                  <Input value={depositValue} placeholder={e.deposit.value} keyboardType="number-pad" onChangeText={(v) => setDepositValue(v.replace(/\D/g, ''))} style={styles.flex} />
                  <View style={styles.flex}>
                    <Select
                      value={depositType}
                      placeholder={e.deposit.value}
                      options={DEPOSIT_TYPES.map((d) => ({ value: d, label: e.deposit.types[d] }))}
                      onChange={(v) => {
                        setDepositType(v as DepositType);
                        setDepositValue('');
                      }}
                    />
                  </View>
                </View>
                <ThemedText type="caption" themeColor="textSecondary">
                  {e.deposit.terms}
                </ThemedText>
              </>
            )}
          </Card>
        )}

        {product && <Button label={s.products.deleteProduct} icon="trash" variant="outline" onPress={remove} />}
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
        <Button label={e.saveDraft} variant="outline" loading={saving === 'draft'} disabled={!!saving} onPress={() => void save('draft')} style={styles.flex} />
        <Button
          label={product?.status === 'PUBLISHED' ? e.saveChanges : e.publish}
          loading={saving === 'publish'}
          disabled={!!saving}
          onPress={() => void save('publish')}
          style={styles.flex}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

function VideoPreview({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />;
}

function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'danger'; children: string }) {
  const c = tone === 'danger' ? { bg: '#fef2f2', fg: '#991b1b' } : { bg: '#fffbeb', fg: '#92400e' };
  return (
    <View style={[styles.notice, { backgroundColor: c.bg }]}>
      <ThemedText type="small" style={{ color: c.fg }}>
        {children}
      </ThemedText>
    </View>
  );
}

function swap<T>(list: T[], a: number, b: number): T[] {
  const next = [...list];
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: Spacing.three },
  content: { padding: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  multiline: { minHeight: 90, textAlignVertical: 'top', paddingTop: Spacing.two },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  photo: { width: 92, height: 92, borderRadius: Radius.md, overflow: 'hidden' },
  cover: { position: 'absolute', left: 4, top: 4, borderRadius: 6, paddingHorizontal: 5 },
  coverText: { color: '#ffffff', fontSize: 10, lineHeight: 16, fontWeight: '700' },
  photoActions: { position: 'absolute', right: 4, bottom: 4, flexDirection: 'row', gap: 4 },
  photoBtn: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 4 },
  video: { width: '100%', height: 220, borderRadius: Radius.md, backgroundColor: '#000000' },
  iconBtn: { width: 46, height: 46, borderRadius: Radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 40, alignSelf: 'flex-start', paddingHorizontal: Spacing.three },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  group: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two + 2, gap: Spacing.two },
  values: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one + 2 },
  value: { borderRadius: Radius.full, paddingHorizontal: Spacing.two + 2, paddingVertical: 3 },
  combo: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two + 2, gap: Spacing.two },
  comboName: { fontWeight: '700' },
  skuInput: { fontSize: 13 },
  notice: { borderRadius: Radius.md, padding: Spacing.three },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
});

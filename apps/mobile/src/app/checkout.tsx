import { CHECKOUT_PAYMENT_METHODS, formatPhone, MAX_CART_QUANTITY, MAX_PAYMENT_SLIPS, provinceName, type CheckoutPaymentMethod } from '@talad/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { KeyboardAvoid } from '@/components/keyboard-avoid';
import { Notice } from '@/components/order/notice';
import { SlipPicker, TransferPanel, useAskPhoto } from '@/components/order/payment';
import { Sheet } from '@/components/seller/sheet';
import { Stepper } from '@/components/stepper';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadError, Loading } from '@/components/ui';
import { BrandGreen, FontFamily, Radius, Spacing } from '@/constants/theme';
import { CART_KEY } from '@/hooks/use-cart';
import { useTheme } from '@/hooks/use-theme';
import { api, ApiError, SITE_URL, upload, type AddressItem, type CartItem } from '@/lib/api';
import type { CheckoutQuote, CheckoutSelection, PlacedOrder } from '@/lib/checkout';
import { money } from '@/lib/format';
import { fill, useI18n } from '@/lib/i18n';
import { orderError, useOrderI18n } from '@/lib/order-i18n';
import type { LocalFile } from '@/lib/orders';
import { ADDRESSES_KEY } from '@/lib/query-keys';

type DeliveryMode = 'standard' | 'urgent' | 'pickup';
/** A slip picked in checkout: uploaded at once; `key` goes with the order. `amount`: what it paid (a new total needs new slips). */
type Slip = LocalFile & { key: string | null; uploading: boolean; failed: boolean; amount: number };

const PAYMENT_ICONS: Record<CheckoutPaymentMethod, IconName> = { BANK_TRANSFER: 'qr', COD: 'coins' };

/** Courier logos are set by MC Mart as website paths (/logos/anousith-express.png) or full URLs. */
const logoSrc = (url: string) => (url.startsWith('/') ? `${SITE_URL}${url}` : url);

/**
 * Checkout in the app (§4.4), as the website's: items per shop with each shop's delivery choice
 * (courier, the shop's urgent delivery, or pickup), address, courier, payment (QR transfer to
 * MC Mart with slips, or cash on delivery with any shop deposits), points, coupon and a note.
 * Every change is priced again by the API (POST /me/checkout/quote); the order goes to POST /me/checkout.
 */
export default function CheckoutScreen() {
  const { items } = useLocalSearchParams<{ items?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { o } = useOrderI18n();
  const c = o.checkout;
  const askPhoto = useAskPhoto();

  const itemIds = (items ?? '').split(',').filter(Boolean);
  const addresses = useQuery({ queryKey: ADDRESSES_KEY, queryFn: () => api<AddressItem[]>('/me/addresses') });
  const [addressId, setAddressId] = useState<string | null>(null);
  const address = addresses.data?.find((a) => a.id === addressId) ?? addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0] ?? null;

  const [courier, setCourier] = useState<string | undefined>();
  const [couponCode, setCouponCode] = useState<string | undefined>();
  const [couponInput, setCouponInput] = useState('');
  const [urgent, setUrgent] = useState<string[]>([]);
  const [pickup, setPickup] = useState<string[]>([]);
  const [usePoints, setUsePoints] = useState(false);
  // Bumped after a quantity change, so the quote is fetched again.
  const [cartVersion, setCartVersion] = useState(0);

  const selection: CheckoutSelection = {
    itemIds,
    ...(courier && { deliveryProviderId: courier }),
    ...(couponCode && { couponCode }),
    ...(address && { addressId: address.id }),
    ...(urgent.length > 0 && { urgentShopIds: urgent }),
    ...(pickup.length > 0 && { pickupShopIds: pickup }),
    ...(usePoints && { usePoints: true }),
  };
  const quoteQuery = useQuery({
    queryKey: ['me', 'checkout', selection, cartVersion],
    queryFn: () => api<CheckoutQuote>('/me/checkout/quote', { method: 'POST', body: selection }),
    enabled: itemIds.length > 0 && !addresses.isPending,
    placeholderData: keepPreviousData,
  });
  const quote = quoteQuery.data;
  const requoting = quoteQuery.isFetching;

  const methods = CHECKOUT_PAYMENT_METHODS.filter((m) => quote?.paymentMethods.includes(m));
  const usable = (m: CheckoutPaymentMethod) => (m === 'BANK_TRANSFER' ? !!quote?.transferAvailable : m === 'COD' ? !!quote?.codAvailable : true);
  const [payment, setPayment] = useState<CheckoutPaymentMethod | null>(null);
  const method = payment && usable(payment) ? payment : (methods.find(usable) ?? methods[0] ?? 'BANK_TRANSFER');

  const [slips, setSlips] = useState<Slip[]>([]);
  const [depositSlips, setDepositSlips] = useState<Record<string, Slip>>({});
  const [note, setNote] = useState('');
  // A slip photo being chosen (camera / gallery), and the address picker: separate on purpose.
  const [picking, setPicking] = useState(false);
  const [addressSheet, setAddressSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  const isTransfer = method === 'BANK_TRANSFER';
  const paidByPoints = !!quote && quote.total === 0 && quote.points.used > 0;
  // Slips paid a total; when the total changes they no longer count (as on the website).
  const currentSlips = slips.filter((s) => s.amount === quote?.total);
  const slipsReset = currentSlips.length < slips.length;
  const slipKeys = currentSlips.flatMap((s) => (s.key ? [s.key] : []));
  const transferSlipsMissing = isTransfer && !paidByPoints && (slipKeys.length === 0 || currentSlips.some((s) => !s.key));
  const depositShops = method === 'COD' ? (quote?.shops.filter((s) => s.deposit > 0) ?? []) : [];
  // A deposit slip counts only for the deposit it paid.
  const depositSlip = (shopId: string, deposit: number) => (depositSlips[shopId]?.amount === deposit ? depositSlips[shopId] : undefined);
  const depositsMissing = depositShops.some((s) => !depositSlip(s.shop.id, s.deposit)?.key);
  const slipsMissing = transferSlipsMissing || depositsMissing;
  const blocked = !!quote && quote.issues.length > 0;

  async function sendSlip(file: LocalFile): Promise<string | null> {
    try {
      return (await upload<{ slipKey: string }>('/me/checkout/slips', 'file', file)).slipKey;
    } catch (e) {
      setError(orderError(o, e instanceof ApiError ? e.code : undefined));
      return null;
    }
  }

  async function addSlip() {
    setPicking(true);
    const file = await askPhoto();
    setPicking(false);
    if (!file || !quote) return;
    const amount = quote.total;
    setSlips((list) => [...list.filter((s) => s.amount === amount), { ...file, key: null, uploading: true, failed: false, amount }]);
    const key = await sendSlip(file);
    setSlips((list) => list.map((s) => (s.uri === file.uri ? { ...s, key, uploading: false, failed: !key } : s)));
  }

  async function addDepositSlip(shopId: string, amount: number) {
    const file = await askPhoto();
    if (!file) return;
    setDepositSlips((all) => ({ ...all, [shopId]: { ...file, key: null, uploading: true, failed: false, amount } }));
    const key = await sendSlip(file);
    setDepositSlips((all) => (all[shopId]?.uri === file.uri ? { ...all, [shopId]: { ...all[shopId]!, key, uploading: false, failed: !key } } : all));
  }

  async function changeQuantity(item: CartItem, quantity: number) {
    setError(null);
    try {
      await api(`/me/cart/items/${item.id}`, { method: 'PATCH', body: { quantity } });
      void queryClient.invalidateQueries({ queryKey: CART_KEY });
    } catch (e) {
      setError(orderError(o, e instanceof ApiError ? e.code : undefined));
    }
    setCartVersion((v) => v + 1);
  }

  function chooseDelivery(shopId: string, mode: DeliveryMode) {
    setUrgent((ids) => [...ids.filter((id) => id !== shopId), ...(mode === 'urgent' ? [shopId] : [])]);
    setPickup((ids) => [...ids.filter((id) => id !== shopId), ...(mode === 'pickup' ? [shopId] : [])]);
  }

  async function place() {
    if (!quote) return;
    if (!address) return setError(o.cartErrors.ADDRESS_REQUIRED);
    setError(null);
    setPlacing(true);
    try {
      const order = await api<PlacedOrder>('/me/checkout', {
        method: 'POST',
        body: {
          itemIds,
          addressId: address.id,
          paymentMethod: method,
          expectedTotal: quote.total,
          ...(quote.delivery.needed && quote.delivery.selectedId && { deliveryProviderId: quote.delivery.selectedId }),
          ...(quote.coupon && { couponCode: quote.coupon.code }),
          ...(quote.shops.some((s) => s.urgentSelected) && { urgentShopIds: quote.shops.filter((s) => s.urgentSelected).map((s) => s.shop.id) }),
          ...(quote.shops.some((s) => s.pickupSelected) && { pickupShopIds: quote.shops.filter((s) => s.pickupSelected).map((s) => s.shop.id) }),
          ...(quote.points.used > 0 && { usePoints: true }),
          ...(isTransfer && !paidByPoints && { slipKeys }),
          ...(depositShops.length > 0 && { depositSlips: Object.fromEntries(depositShops.map((s) => [s.shop.id, depositSlip(s.shop.id, s.deposit)?.key ?? ''])) }),
          ...(note.trim() && { note: note.trim() }),
        },
      });
      void queryClient.invalidateQueries({ queryKey: CART_KEY });
      void queryClient.invalidateQueries({ queryKey: ['me', 'orders'] });
      void queryClient.invalidateQueries({ queryKey: ['me', 'points'] });
      setPlaced(order);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setError(orderError(o, code));
      // Prices or stock moved: price it again so the customer sees current numbers.
      if (code === 'PRICE_CHANGED' || code === 'CART_CHANGED') setCartVersion((v) => v + 1);
    } finally {
      setPlacing(false);
    }
  }

  if (placed) return <Success order={placed} />;

  if (!itemIds.length) return <EmptyState icon="cart" title={o.cartErrors.NOTHING_SELECTED} action={<Button label={c.backToCart} onPress={() => router.back()} />} />;
  if (addresses.isPending || (quoteQuery.isPending && quoteQuery.fetchStatus !== 'idle')) return <Loading />;
  if (!quote)
    return (
      <View style={[styles.flex, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: c.title }} />
        <LoadError onRetry={() => void quoteQuery.refetch()} />
      </View>
    );

  const dim = requoting ? styles.dim : undefined;

  return (
    <KeyboardAvoid style={[styles.flex, { backgroundColor: theme.background }]}>
      <Stack.Screen options={{ title: c.title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {blocked && (
          <Notice tone="red" icon="alert">
            {o.cartErrors.CART_CHANGED}
          </Notice>
        )}

        {/* Items per shop, each with its delivery choice. */}
        {quote.shops.map((s) => {
          const selected: DeliveryMode = s.pickupSelected ? 'pickup' : s.urgentSelected ? 'urgent' : 'standard';
          const modes: DeliveryMode[] = ['standard', ...(s.urgent ? (['urgent'] as const) : []), ...(s.pickup ? (['pickup'] as const) : [])];
          return (
            <Card key={s.shop.id} style={styles.flush}>
              <View style={[styles.shopHead, { borderBottomColor: theme.border }]}>
                <Icon name="shop" size={16} color={theme.primary} />
                <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                  {s.shop.name}
                </ThemedText>
              </View>
              {s.items.map((item, i) => (
                <View key={item.id} style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }, !item.available && styles.dim]}>
                  <View style={[styles.thumb, { backgroundColor: theme.backgroundElement }]}>
                    {item.imageUrl ? <Image source={item.imageUrl} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="package" size={20} color={theme.textSecondary} />}
                  </View>
                  <View style={[styles.flex, styles.gapXs]}>
                    <ThemedText type="small" numberOfLines={2}>
                      {item.name}
                    </ThemedText>
                    {item.variantLabel && (
                      <ThemedText type="caption" themeColor="textSecondary">
                        {item.variantLabel}
                      </ThemedText>
                    )}
                    <View style={styles.between}>
                      {item.available ? (
                        <Stepper value={item.quantity} max={Math.min(item.stock, MAX_CART_QUANTITY)} disabled={requoting} onChange={(n) => void changeQuantity(item, n)} />
                      ) : (
                        <ThemedText type="caption" themeColor="textSecondary">
                          x{item.quantity}
                        </ThemedText>
                      )}
                      <ThemedText type="smallBold" style={dim}>
                        {money(item.lineTotal)}
                      </ThemedText>
                    </View>
                  </View>
                </View>
              ))}
              {modes.length > 1 && (
                <View style={[styles.section, styles.modes, { borderTopColor: theme.border }]} accessibilityRole="radiogroup">
                  {modes.map((mode) => (
                    <Choice
                      key={mode}
                      compact
                      active={selected === mode}
                      disabled={requoting}
                      icon={mode === 'urgent' ? 'flash' : mode === 'pickup' ? 'shop' : 'truck'}
                      iconColor={mode === 'urgent' ? theme.sale : undefined}
                      title={mode === 'urgent' ? c.deliveryUrgent : mode === 'pickup' ? c.deliveryPickup : c.deliveryStandard}
                      sub={
                        mode === 'urgent'
                          ? [s.urgent!.free ? c.deliveryFree : money(s.urgent!.fee), s.urgent!.distanceKm !== null && fill(c.distanceKm, { km: s.urgent!.distanceKm.toFixed(1) }), s.urgent!.eta]
                              .filter(Boolean)
                              .join(' · ')
                          : mode === 'pickup'
                            ? c.deliveryPickupHint
                            : c.deliveryStandardHint
                      }
                      onPress={() => selected !== mode && chooseDelivery(s.shop.id, mode)}
                    />
                  ))}
                </View>
              )}
              {s.pinForFreeKm !== null && address && (
                <View style={[styles.section, styles.row, { borderTopColor: theme.border, backgroundColor: theme.primarySoft }]}>
                  <Icon name="location" size={16} color={theme.primary} />
                  <ThemedText type="caption" style={styles.flex}>
                    {fill(c.pinForFree, { km: s.pinForFreeKm })}
                  </ThemedText>
                  <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/address-form', params: { id: address.id } })} style={[styles.chip, { backgroundColor: theme.primary }]}>
                    <ThemedText type="caption" style={styles.whiteBold}>
                      {c.pinAddress}
                    </ThemedText>
                  </Pressable>
                </View>
              )}
              {s.pickupSelected && s.pickup?.address && (
                <View style={[styles.section, styles.row, { borderTopColor: theme.border }]}>
                  <Icon name="location" size={16} color={theme.primary} />
                  <View style={styles.flex}>
                    <ThemedText type="caption" themeColor="textSecondary">
                      {c.pickupAt}
                    </ThemedText>
                    <ThemedText type="small">{s.pickup.address}</ThemedText>
                    {s.pickup.latitude !== null && s.pickup.longitude !== null && (
                      <ThemedText type="caption" themeColor="primary" onPress={() => void Linking.openURL(`https://www.google.com/maps?q=${s.pickup!.latitude},${s.pickup!.longitude}`)}>
                        {c.openMap}
                      </ThemedText>
                    )}
                  </View>
                </View>
              )}
              {s.shippingFee > 0 && <Line label={c.shippingFee} value={money(s.shippingFee)} border={theme.border} style={dim} />}
              {s.discount > 0 && <Line label={c.discount} value={`-${money(s.discount)}`} border={theme.border} sale style={dim} />}
              {(quote.shops.length > 1 || s.discount > 0 || s.shippingFee > 0) && <Line label={c.total} value={money(s.total)} border={theme.border} bold style={dim} />}
            </Card>
          );
        })}

        {/* Delivery address */}
        <Card style={styles.card}>
          <View style={styles.between}>
            <Title icon="location" required>
              {c.deliveryAddress}
            </Title>
            {address && (
              <Pressable accessibilityRole="button" onPress={() => setAddressSheet(true)} hitSlop={8}>
                <ThemedText type="smallBold" themeColor="primary">
                  {c.change}
                </ThemedText>
              </Pressable>
            )}
          </View>
          {address ? (
            <AddressSummary address={address} />
          ) : (
            <View style={[styles.dashed, { borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                {c.noAddress}
              </ThemedText>
              <Button label={c.addAddress} icon="add" onPress={() => router.push('/address-form')} />
            </View>
          )}
        </Card>

        {/* Courier: only for shops not delivering themselves or collected from. */}
        {quote.delivery.options.length > 0 && quote.delivery.needed && (
          <Card style={styles.card}>
            <Title icon="truck" required>
              {c.delivery}
            </Title>
            <View style={styles.grid3} accessibilityRole="radiogroup">
              {quote.delivery.options.map((opt) => {
                const active = opt.id === (courier ?? quote.delivery.selectedId);
                return (
                  <Pressable
                    key={opt.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={opt.name}
                    onPress={() => setCourier(opt.id)}
                    style={[styles.courier, { borderColor: active ? theme.primary : theme.border }, active && { backgroundColor: theme.primarySoft }]}>
                    {opt.logoUrl ? (
                      <Image source={logoSrc(opt.logoUrl)} style={styles.courierLogo} contentFit="contain" />
                    ) : (
                      <View style={[styles.courierLogo, styles.center, { backgroundColor: theme.backgroundElement }]}>
                        <Icon name="truck" size={20} color={theme.textSecondary} />
                      </View>
                    )}
                    <ThemedText type="caption" numberOfLines={1}>
                      {opt.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText type="caption" themeColor="textSecondary">
              {c.deliveryFeeNote}
            </ThemedText>
          </Card>
        )}
        {quote.delivery.noCommonCourier && (
          <Card style={styles.card}>
            <Title icon="truck" required>
              {c.delivery}
            </Title>
            <ThemedText type="small" themeColor="sale">
              {c.deliveryNoCommon}
            </ThemedText>
          </Card>
        )}

        {/* Payment method */}
        <Card style={styles.card}>
          <Title icon="card" required>
            {c.paymentMethod}
          </Title>
          <View style={styles.grid2} accessibilityRole="radiogroup">
            {methods.map((m) => (
              <Choice key={m} active={method === m} disabled={!usable(m)} icon={PAYMENT_ICONS[m]} title={o.account.paymentMethod[m]} sub={c.paymentHints[m]} onPress={() => setPayment(m)} />
            ))}
          </View>
          {!methods.some(usable) ? (
            <ThemedText type="caption" themeColor="sale">
              {c.noPaymentMethod}
            </ThemedText>
          ) : (
            <>
              {methods.includes('BANK_TRANSFER') && !quote.transferAvailable && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {c.transferUnavailable}
                </ThemedText>
              )}
              {methods.includes('COD') && !quote.codAvailable && (
                <ThemedText type="caption" themeColor="textSecondary">
                  {c.codUnavailable}
                </ThemedText>
              )}
            </>
          )}
        </Card>

        {/* Loyalty points: pay part (or all) of the order with them. */}
        {quote.points.balance > 0 && quote.points.value > 0 && (
          <Card style={styles.card}>
            <Title icon="points">{c.pointsTitle}</Title>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: quote.points.used > 0, disabled: requoting || quote.points.usable === 0 }}
              disabled={requoting || quote.points.usable === 0}
              onPress={() => setUsePoints(!(quote.points.used > 0))}
              style={[styles.pointsRow, { borderColor: quote.points.used > 0 ? theme.primary : theme.border }, quote.points.used > 0 && { backgroundColor: theme.primarySoft }, quote.points.usable === 0 && styles.dim]}>
              <View style={[styles.check, { borderColor: theme.primary }, quote.points.used > 0 && { backgroundColor: theme.primary }]}>
                {quote.points.used > 0 && <Icon name="check" size={14} color="#ffffff" strokeWidth={3} />}
              </View>
              <View style={styles.flex}>
                <ThemedText type="smallBold">
                  {fill(c.pointsUse, { n: (quote.points.used || quote.points.usable).toLocaleString('en-US'), amount: money((quote.points.used || quote.points.usable) * quote.points.value) })}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary">
                  {fill(c.pointsBalance, { n: quote.points.balance.toLocaleString('en-US'), value: money(quote.points.value) })}
                </ThemedText>
              </View>
            </Pressable>
            {paidByPoints && (
              <ThemedText type="smallBold" themeColor="primary">
                {c.pointsCoverAll}
              </ThemedText>
            )}
          </Card>
        )}

        {/* QR transfer: one payment to MC Mart for the whole order, then its slips. */}
        {isTransfer && quote.transfer && !paidByPoints && (
          <Card style={styles.card}>
            <TransferPanel title={c.payVreview} body={c.scanBody} qrPath={quote.transfer.hasQr ? '/me/checkout/payment-qr' : null} amount={quote.total} transfer={quote.transfer} />
            <Title icon="receipt" required>
              {c.slipTitle}
            </Title>
            <ThemedText type="caption" themeColor="textSecondary">
              {fill(c.slipsBody, { n: MAX_PAYMENT_SLIPS })}
            </ThemedText>
            <SlipPicker
              picked={currentSlips}
              max={MAX_PAYMENT_SLIPS}
              busy={picking}
              onAdd={() => void addSlip()}
              onRemove={(i) => setSlips((list) => list.filter((s) => s.uri !== currentSlips[i]?.uri))}
            />
            {slipsReset && (
              <ThemedText type="caption" themeColor="sale">
                {c.slipReset}
              </ThemedText>
            )}
          </Card>
        )}

        {/* COD with a deposit: paid to each shop's own QR, which the shop confirms. */}
        {depositShops.map((s) => {
          const slip = depositSlip(s.shop.id, s.deposit);
          return (
            <Card key={s.shop.id} style={styles.card}>
              <TransferPanel
                title={fill(c.depositScanTitle, { shop: s.shop.name })}
                body={c.depositScanBody}
                qrPath={s.depositAccount?.hasQr !== false ? `/me/checkout/shops/${encodeURIComponent(s.shop.id)}/deposit-qr` : null}
                amount={s.deposit}
                transfer={s.depositAccount ?? { bankCode: null, accountName: null, accountNumber: null, hasQr: true }}
              />
              <Title icon="receipt" required>
                {c.slipTitle}
              </Title>
              <SlipPicker
                picked={slip ? [slip] : []}
                max={1}
                onAdd={() => void addDepositSlip(s.shop.id, s.deposit)}
                onRemove={() => setDepositSlips((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== s.shop.id)))}
              />
              <Notice tone="amber" icon="alert">
                {fill(c.depositTerms, { rest: money(s.total - s.deposit) })}
              </Notice>
            </Card>
          );
        })}

        {/* Discount coupon */}
        <Card style={styles.card}>
          <Title icon="coupon">{c.coupon}</Title>
          {quote.coupon ? (
            <View style={[styles.coupon, { borderColor: theme.primary, backgroundColor: theme.primarySoft }]}>
              <ThemedText type="small" themeColor="primary" style={styles.flex}>
                {fill(c.couponSaved, { code: quote.coupon.code, amount: money(quote.coupon.discount) })}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={c.removeCoupon}
                disabled={requoting}
                hitSlop={8}
                onPress={() => {
                  setCouponInput('');
                  setCouponCode(undefined);
                }}>
                <Icon name="x" size={18} color={theme.textSecondary} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.row}>
              <TextInput
                value={couponInput}
                onChangeText={setCouponInput}
                placeholder={c.couponPlaceholder}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="characters"
                maxLength={40}
                returnKeyType="done"
                onSubmitEditing={() => couponInput.trim() && setCouponCode(couponInput.trim())}
                style={[styles.input, styles.flex, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
              />
              <Button label={c.applyCoupon} disabled={requoting || !couponInput.trim()} onPress={() => setCouponCode(couponInput.trim())} />
            </View>
          )}
          {couponCode && quote.couponError && (
            <ThemedText type="caption" themeColor="sale">
              {orderError(o, quote.couponError)}
            </ThemedText>
          )}
        </Card>

        {/* Order note */}
        <Card style={styles.card}>
          <Title icon="comment">{c.noteLabel}</Title>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={c.notePlaceholder}
            placeholderTextColor={theme.textSecondary}
            maxLength={500}
            multiline
            style={[styles.input, styles.textarea, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
          />
        </Card>

        {/* Summary */}
        <Card style={[styles.card, dim]}>
          <ThemedText type="smallBold">{c.summary}</ThemedText>
          <SummaryRow label={o.account.subtotal} value={money(quote.subtotal)} />
          <SummaryRow label={c.discount} value={`${quote.discountTotal > 0 ? '-' : ''}${money(quote.discountTotal)}`} sale={quote.discountTotal > 0} />
          {quote.shippingTotal > 0 && <SummaryRow label={c.shippingFee} value={money(quote.shippingTotal)} />}
          {quote.points.discount > 0 && <SummaryRow label={fill(c.pointsLine, { n: quote.points.used.toLocaleString('en-US') })} value={`-${money(quote.points.discount)}`} sale />}
        </Card>
      </ScrollView>

      {/* Total + place order, pinned to the bottom as on the website's phone layout. */}
      <View style={[styles.bar, { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
        {slipsMissing && (
          <ThemedText type="caption" style={styles.amber}>
            ⚠ {depositsMissing ? c.depositRequired : c.slipRequired}
          </ThemedText>
        )}
        {error && (
          <ThemedText type="caption" themeColor="sale">
            {error}
          </ThemedText>
        )}
        <View style={styles.row}>
          <View style={styles.flex}>
            <ThemedText type="caption" themeColor="textSecondary">
              {c.total}
            </ThemedText>
            <View style={styles.row}>
              <ThemedText type="subtitle" themeColor="primary" style={dim}>
                {money(quote.total)}
              </ThemedText>
              {requoting && <ActivityIndicator size="small" color={theme.primary} />}
            </View>
          </View>
          <Button
            label={c.placeOrder}
            loading={placing}
            disabled={requoting || blocked || quote.delivery.noCommonCourier || !address || slipsMissing || !methods.some(usable)}
            onPress={() => void place()}
          />
        </View>
      </View>

      <Sheet visible={addressSheet && !!address} title={c.chooseAddress} onClose={() => setAddressSheet(false)}>
        {addresses.data?.map((a) => (
          <Pressable
            key={a.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: a.id === address?.id }}
            onPress={() => {
              setAddressId(a.id);
              setAddressSheet(false);
            }}
            style={[styles.addressOption, { borderColor: a.id === address?.id ? theme.primary : theme.border }, a.id === address?.id && { backgroundColor: theme.primarySoft }]}>
            <AddressSummary address={a} defaultLabel={a.isDefault ? o.account.defaultBadge : undefined} />
          </Pressable>
        ))}
        <Button
          label={c.addAddress}
          icon="add"
          variant="outline"
          onPress={() => {
            setAddressSheet(false);
            router.push('/address-form');
          }}
        />
      </Sheet>
    </KeyboardAvoid>
  );
}

/** Order placed: what's next, and the way to the order (or orders, one per shop). */
function Success({ order }: { order: PlacedOrder }) {
  const theme = useTheme();
  const router = useRouter();
  const { o } = useOrderI18n();
  const { t } = useI18n();
  const c = o.checkout;
  const one = order.shopOrders.length === 1 ? order.shopOrders[0] : null;
  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={[styles.content, styles.successBox]}>
      <Stack.Screen options={{ title: c.successTitle, headerBackVisible: false, gestureEnabled: false }} />
      <View style={[styles.successIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name="done" size={44} color={BrandGreen} />
      </View>
      <ThemedText type="title" style={styles.centerText}>
        {c.successTitle}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        {c.successBody}
      </ThemedText>
      {order.shopOrders.length > 1 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {fill(c.successSplit, { n: order.shopOrders.length })}
        </ThemedText>
      )}
      {order.paymentMethod === 'COD' && (
        <Notice tone="green" icon="coins">
          {fill(c.codNote, { amount: money(order.total) })}
        </Notice>
      )}
      <Button label={one ? c.viewOrder : c.viewOrders} onPress={() => router.replace(one ? `/orders/${one}` : '/orders')} style={styles.stretch} />
      <Button label={t.cart.continueShopping} variant="outline" onPress={() => router.dismissTo('/')} style={styles.stretch} />
    </ScrollView>
  );
}

function AddressSummary({ address, defaultLabel }: { address: AddressItem; defaultLabel?: string }) {
  const theme = useTheme();
  const { locale } = useOrderI18n();
  return (
    <View style={styles.gapXs}>
      <View style={styles.rowWrap}>
        <ThemedText type="smallBold">{address.recipientName}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatPhone(address.phone)}
        </ThemedText>
        {defaultLabel && (
          <View style={[styles.badge, { backgroundColor: theme.primary }]}>
            <ThemedText type="caption" style={styles.whiteBold}>
              {defaultLabel}
            </ThemedText>
          </View>
        )}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {[address.line, address.village, address.district, provinceName(address.province, locale)].filter(Boolean).join(', ')}
      </ThemedText>
    </View>
  );
}

/** A selectable tile (delivery mode, payment method). */
function Choice({
  active,
  disabled,
  compact,
  icon,
  iconColor,
  title,
  sub,
  onPress,
}: {
  active: boolean;
  disabled?: boolean;
  /** In a row of tiles: shares the width, icon above the words. */
  compact?: boolean;
  icon: IconName;
  iconColor?: string;
  title: string;
  sub: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.choice,
        compact && styles.choiceCompact,
        { borderColor: active ? theme.primary : theme.border },
        active && { backgroundColor: theme.primarySoft },
        disabled && styles.dim,
      ]}>
      <View style={[styles.choiceIcon, compact && styles.choiceIconCompact, { backgroundColor: active ? theme.primary : theme.backgroundElement }]}>
        <Icon name={icon} size={compact ? 16 : 18} color={active ? '#ffffff' : (iconColor ?? theme.textSecondary)} />
      </View>
      <View style={compact ? styles.choiceTextCompact : styles.flex}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {title}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={compact ? 3 : 2}>
          {sub}
        </ThemedText>
      </View>
    </Pressable>
  );
}

function Title({ icon, required, children }: { icon: IconName; required?: boolean; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.titleIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={16} color={theme.primary} />
      </View>
      <ThemedText type="smallBold">
        {children}
        {required && <ThemedText type="smallBold" themeColor="sale">{' *'}</ThemedText>}
      </ThemedText>
    </View>
  );
}

function Line({ label, value, border, sale, bold, style }: { label: string; value: string; border: string; sale?: boolean; bold?: boolean; style?: object }) {
  return (
    <View style={[styles.section, styles.between, { borderTopColor: border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor={sale ? 'sale' : undefined} style={[bold && styles.bold, style]}>
        {value}
      </ThemedText>
    </View>
  );
}

function SummaryRow({ label, value, sale }: { label: string; value: string; sale?: boolean }) {
  return (
    <View style={styles.between}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" themeColor={sale ? 'sale' : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.three, gap: Spacing.two },
  flush: { overflow: 'hidden' },
  shopHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  item: { flexDirection: 'row', gap: Spacing.three, padding: Spacing.three },
  thumb: { width: 60, height: 60, borderRadius: Radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  gapXs: { gap: 2 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowWrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Spacing.two },
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2 },
  // Side by side (each shop's standard / urgent / pickup), as on the website.
  modes: { flexDirection: 'row', gap: Spacing.two },
  chip: { borderRadius: Radius.full, paddingHorizontal: Spacing.two + 2, paddingVertical: 6 },
  whiteBold: { color: '#ffffff', fontWeight: '700' },
  dim: { opacity: 0.45 },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two, alignItems: 'flex-start' },
  grid3: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  grid2: { gap: Spacing.two },
  courier: { width: '31%', flexGrow: 1, alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two },
  courierLogo: { width: 56, height: 56, borderRadius: Radius.sm, backgroundColor: '#ffffff' },
  center: { alignItems: 'center', justifyContent: 'center' },
  choice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two + 2 },
  choiceCompact: { flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: Spacing.one, padding: Spacing.two },
  choiceIconCompact: { width: 30, height: 30 },
  choiceTextCompact: { alignSelf: 'stretch' },
  choiceIcon: { width: 36, height: 36, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  titleIcon: { width: 28, height: 28, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  pointsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  coupon: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderStyle: 'dashed', borderRadius: Radius.md, padding: Spacing.two + 2 },
  input: { borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, height: 46, fontSize: 15, fontFamily: FontFamily.regular },
  textarea: { height: 90, paddingTop: Spacing.two, textAlignVertical: 'top' },
  bold: { fontWeight: '800' },
  bar: { gap: Spacing.one, paddingHorizontal: Spacing.three, paddingTop: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth },
  amber: { color: '#b45309', fontWeight: '600' },
  addressOption: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three },
  badge: { borderRadius: Radius.full, paddingHorizontal: Spacing.two },
  successBox: { alignItems: 'center', paddingTop: Spacing.six },
  successIcon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
});

"use client";

import {
  CHECKOUT_PAYMENT_METHODS,
  formatMoney,
  formatPhone,
  MAX_CART_QUANTITY,
  provinceName,
  type CheckoutPaymentMethod,
  type Locale,
} from "@talad/shared";
import {
  ArrowLeft,
  Banknote,
  CircleAlert,
  CreditCard,
  LoaderCircle,
  MapPin,
  MessageSquareText,
  Package,
  Plus,
  QrCode,
  Store,
  TicketPercent,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { ProductImage } from "../product-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { getCheckoutQuote, placeOrder, setCartQuantity, uploadCheckoutSlip } from "@/lib/cart-actions";
import { compressImage } from "@/lib/compress-image";
import type { CartItem, CheckoutQuote } from "@/lib/cart";
import { interpolate } from "@/lib/format";
import type { AddressItem } from "@/lib/profile";
import { AddressForm } from "../account/address-book";
import { PageHeading } from "../account/page-heading";
import { Modal } from "../auth/modal";
import { useSession } from "../auth/session-provider";
import { emptySlip, PaymentPanel, type SlipState } from "./payment-panel";
import { QuantityStepper } from "./quantity-stepper";

const PAYMENT_ICONS: Record<CheckoutPaymentMethod, LucideIcon> = {
  BANK_TRANSFER: QrCode,
  COD: Banknote,
};

export function CheckoutForm({
  locale,
  dict,
  accountDict,
  cartErrors,
  closeLabel,
  stepperLabels,
  quote: initialQuote,
  addresses,
  initialAddressId,
  itemIds,
}: {
  locale: Locale;
  dict: Dictionary["checkout"];
  accountDict: Dictionary["account"];
  cartErrors: Dictionary["cartErrors"];
  closeLabel: string;
  stepperLabels: { decrease: string; increase: string };
  quote: CheckoutQuote;
  addresses: AddressItem[];
  /** From the URL, so a re-render keeps the chosen address. */
  initialAddressId: string | null;
  itemIds: string[];
}) {
  const router = useRouter();
  const { refresh: refreshSession, setCartCount } = useSession();
  // A quote fetched after a quantity change; a newer server render (router.refresh) replaces it.
  const [fresh, setFresh] = useState<{ from: CheckoutQuote; quote: CheckoutQuote } | null>(null);
  const quote = fresh?.from === initialQuote ? fresh.quote : initialQuote;
  // Quantities the customer picked that the quote hasn't caught up with yet.
  const [desired, setDesired] = useState<Record<string, number>>({});
  const [requoting, startRequote] = useTransition();
  const [addressId, setAddressId] = useState<string | null>(
    () => initialAddressId ?? (addresses.find((a) => a.isDefault) ?? addresses[0])?.id ?? null,
  );
  // Courier picked but not yet priced, so the choice highlights at once.
  const [pendingCourier, setPendingCourier] = useState<string | null>(null);
  const courierId = pendingCourier ?? quote.delivery.selectedId;
  const [couponInput, setCouponInput] = useState("");
  const [couponMessage, setCouponMessage] = useState<string | null>(() =>
    initialQuote.couponError ? cartErrors[initialQuote.couponError] : null,
  );
  const methods = CHECKOUT_PAYMENT_METHODS.filter((m) => quote.paymentMethods.includes(m));
  const [payment, setPayment] = useState<CheckoutPaymentMethod>(() =>
    quote.transferAvailable && methods.includes("BANK_TRANSFER") ? "BANK_TRANSFER" : (methods.find((m) => m !== "BANK_TRANSFER") ?? methods[0] ?? "COD"),
  );
  // Per shop: the uploaded slip's storage key (sent with the order) and its UI state.
  const [slipKeys, setSlipKeys] = useState<Record<string, string>>({});
  const [slips, setSlips] = useState<Record<string, SlipState>>({});
  const [note, setNote] = useState("");
  const [picker, setPicker] = useState<"list" | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Fall back to the default if the chosen address disappeared (e.g. deleted in another tab).
  const address = addresses.find((a) => a.id === addressId) ?? addresses.find((a) => a.isDefault) ?? null;
  const blocked = quote.issues.length > 0;
  const isTransfer = payment === "BANK_TRANSFER";
  const slipsMissing = isTransfer && quote.shops.some((s) => !slipKeys[s.shop.id]);

  async function pickSlip(shopId: string, original: File) {
    const previous = slips[shopId]?.preview;
    if (previous) URL.revokeObjectURL(previous);
    const file = await compressImage(original);
    setSlips((m) => ({ ...m, [shopId]: { ...emptySlip, preview: URL.createObjectURL(file), uploading: true } }));
    // Until the new upload finishes, the old slip no longer counts.
    setSlipKeys((k) => Object.fromEntries(Object.entries(k).filter(([id]) => id !== shopId)));
    const form = new FormData();
    form.set("slip", file);
    const res = await uploadCheckoutSlip(form);
    if (res.ok) setSlipKeys((k) => ({ ...k, [shopId]: res.slipKey }));
    setSlips((m) => ({
      ...m,
      [shopId]: {
        ...m[shopId],
        uploading: false,
        attached: res.ok,
        error: res.ok ? null : (cartErrors[res.error as keyof typeof cartErrors] ?? cartErrors.generic),
      },
    }));
  }

  const qty = (item: CartItem) => desired[item.id] ?? item.quantity;

  /** A shop's slip was for its old total: drop it and say why. */
  function clearSlip(shopId: string) {
    const preview = slips[shopId]?.preview;
    if (preview) URL.revokeObjectURL(preview);
    setSlips((m) => ({ ...m, [shopId]: { ...emptySlip, error: dict.slipReset } }));
    setSlipKeys((k) => Object.fromEntries(Object.entries(k).filter(([id]) => id !== shopId)));
  }

  /** Keeps courier, coupon and address in the URL so a server re-render (router.refresh) keeps them. */
  function syncUrl(params: Record<string, string | null | undefined>) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    window.history.replaceState(null, "", url);
  }

  /**
   * Re-prices the order after any change (quantity, courier, coupon, address). `before`
   * runs first inside the same transition, e.g. saving a new quantity. Server actions run
   * one at a time, so quotes come back in click order.
   */
  function requote(
    change: { courier?: string | null; coupon?: string | null; addressId?: string | null },
    steps: { before?: () => Promise<void>; after?: () => void } = {},
  ) {
    const nextAddressId = change.addressId !== undefined ? change.addressId : (address?.id ?? null);
    const couponCode = change.coupon !== undefined ? change.coupon : (quote.coupon?.code ?? null);
    setError(null);
    if (change.addressId !== undefined) syncUrl({ address: nextAddressId });
    startRequote(async () => {
      await steps.before?.();
      const res = await getCheckoutQuote({
        itemIds,
        ...((change.courier ?? courierId) && { deliveryProviderId: (change.courier ?? courierId)! }),
        ...(couponCode && { couponCode }),
        ...(nextAddressId && { addressId: nextAddressId }),
      });
      setPendingCourier(null);
      steps.after?.();
      if (!res.ok) return router.refresh(); // items gone: the page sends the customer back to the cart
      const next = res.quote;
      // Only shops whose amount changed need a new slip.
      for (const shop of next.shops) {
        const old = quote.shops.find((s) => s.shop.id === shop.shop.id);
        if (old && old.total !== shop.total && (slipKeys[shop.shop.id] || slips[shop.shop.id]?.preview)) {
          clearSlip(shop.shop.id);
        }
      }
      setFresh({ from: initialQuote, quote: next });
      if (couponCode) setCouponMessage(next.couponError ? cartErrors[next.couponError] : null);
      syncUrl({ courier: next.delivery.selectedId, coupon: next.coupon?.code });
    });
  }

  function changeQuantity(item: CartItem, next: number) {
    setDesired((d) => ({ ...d, [item.id]: next }));
    requote(
      {},
      {
        before: async () => {
          const saved = await setCartQuantity(item.id, next);
          if (saved.ok) setCartCount(saved.count);
          else setError(cartErrors[saved.error as keyof typeof cartErrors] ?? cartErrors.generic);
        },
        // The new quote is the truth for this line (the API may clamp to stock), unless clicked again since.
        after: () =>
          setDesired((d) => (d[item.id] === next ? Object.fromEntries(Object.entries(d).filter(([id]) => id !== item.id)) : d)),
      },
    );
  }

  function chooseCourier(id: string) {
    if (id === courierId) return;
    setPendingCourier(id);
    requote({ courier: id });
  }

  function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponMessage(null);
    requote({ coupon: code });
  }

  function removeCoupon() {
    setCouponInput("");
    setCouponMessage(null);
    requote({ coupon: null });
  }

  function chooseAddress(id: string) {
    setAddressId(id);
    // Courier fees can differ by province.
    requote({ addressId: id });
  }

  function submit() {
    if (!address) return setError(cartErrors.ADDRESS_REQUIRED);
    setError(null);
    startTransition(async () => {
      const res = await placeOrder({
        itemIds,
        addressId: address.id,
        paymentMethod: payment,
        expectedTotal: quote.total,
        ...(quote.delivery.selectedId && { deliveryProviderId: quote.delivery.selectedId }),
        ...(quote.coupon && { couponCode: quote.coupon.code }),
        ...(isTransfer && { slips: slipKeys }),
        ...(note.trim() && { note: note.trim() }),
      });
      if (res.ok) {
        void refreshSession(); // cart badge
        router.push(`/${locale}/checkout/success?orders=${res.order.shopOrders.join(",")}`);
        return;
      }
      setError(cartErrors[res.error as keyof typeof cartErrors] ?? cartErrors.generic);
      // Prices or stock moved: reload the quote so the customer sees current numbers.
      if (res.error === "PRICE_CHANGED" || res.error === "CART_CHANGED") router.refresh();
    });
  }

  const placeButton = (
    <button
      type="button"
      disabled={pending || requoting || blocked || !address || slipsMissing}
      onClick={submit}
      className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
    >
      {pending && <LoaderCircle className="size-5 animate-spin" />}
      {dict.placeOrder}
    </button>
  );

  return (
    <>
      <Link
        href={`/${locale}/cart`}
        className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {dict.backToCart}
      </Link>
      <PageHeading title={dict.title} description={dict.description} />

      {blocked && (
        <p role="alert" className="flex items-start gap-2 rounded-2xl bg-sale/10 px-4 py-3 text-sm text-sale">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {cartErrors.CART_CHANGED}{" "}
            <Link href={`/${locale}/cart`} className="font-semibold underline">
              {dict.backToCart}
            </Link>
          </span>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* Items per shop */}
          {quote.shops.map(({ shop, items, discount, total }) => (
            <Card key={shop.id} flush>
              <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold">
                <Store className="size-4 text-primary" />
                {shop.name}
              </div>
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id} className={`flex gap-3 px-4 py-3 ${item.available ? "" : "opacity-50"}`}>
                    <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border">
                      {item.imageUrl ? (
                        <ProductImage src={item.imageUrl} alt="" sizes="56px" className="object-cover" />
                      ) : (
                        <Package className="size-5 text-muted-foreground/50" />
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
                      {item.variantLabel && <p className="text-xs text-muted-foreground">{item.variantLabel}</p>}
                      <p className="text-xs text-muted-foreground tabular-nums">{formatMoney(item.unitPrice, locale)}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-2">
                        {item.available ? (
                          <QuantityStepper
                            value={qty(item)}
                            max={Math.min(item.stock, MAX_CART_QUANTITY)}
                            labels={stepperLabels}
                            onChange={(n) => changeQuantity(item, n)}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">x{item.quantity}</span>
                        )}
                        <p className="text-sm font-semibold tabular-nums">{formatMoney(item.unitPrice * qty(item), locale)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {discount > 0 && (
                <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <TicketPercent className="size-4" />
                    {dict.discount}
                  </span>
                  <span className={`font-semibold tabular-nums text-sale transition-opacity ${requoting ? "opacity-40" : ""}`}>
                    -{formatMoney(discount, locale)}
                  </span>
                </div>
              )}
              {/* Shop total only adds information with several shops or a discount. */}
              {(quote.shops.length > 1 || discount > 0) && (
                <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/40 px-4 py-2.5 text-sm">
                  <span className="text-muted-foreground">{dict.total}</span>
                  <span className={`font-bold tabular-nums transition-opacity ${requoting ? "opacity-40" : ""}`}>
                    {formatMoney(total, locale)}
                  </span>
                </div>
              )}
            </Card>
          ))}

          {/* Delivery address */}
          <Card>
            <div className="flex items-center justify-between gap-3">
              <CardTitle icon={MapPin} required>
                {dict.deliveryAddress}
              </CardTitle>
              {address && (
                <button
                  type="button"
                  onClick={() => setPicker("list")}
                  className="rounded-full px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
                >
                  {dict.change}
                </button>
              )}
            </div>
            {address ? (
              <AddressSummary address={address} locale={locale} />
            ) : (
              <div className="mt-3 flex flex-col items-start gap-3 rounded-xl border-2 border-dashed border-border p-4">
                <p className="text-sm text-muted-foreground">{dict.noAddress}</p>
                <button
                  type="button"
                  onClick={() => setPicker("new")}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  <Plus className="size-4" />
                  {dict.addAddress}
                </button>
              </div>
            )}
          </Card>

          {/* Delivery service */}
          {quote.delivery.options.length > 0 && (
            <Card>
              <CardTitle icon={Truck} required>
                {dict.delivery}
              </CardTitle>
              {/* Phones: three logo tiles in a row; the name shows from sm up. */}
              <div role="radiogroup" aria-label={dict.delivery} className="mt-3 grid grid-cols-3 gap-2">
                {quote.delivery.options.map((option) => {
                  const active = option.id === courierId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      title={option.name}
                      onClick={() => chooseCourier(option.id)}
                      className={`flex items-center justify-center gap-3 rounded-xl border p-2.5 text-left transition-colors sm:justify-start sm:p-3 ${
                        active ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border hover:border-primary/50"
                      }`}
                    >
                      {option.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- small courier logo (local or any CDN)
                        <img
                          src={option.logoUrl}
                          alt=""
                          className="size-14 shrink-0 rounded-lg object-cover shadow-sm ring-1 ring-black/5 sm:size-11"
                        />
                      ) : (
                        <span
                          className={`flex size-14 shrink-0 items-center justify-center rounded-lg sm:size-11 ${
                            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Truck className="size-5" />
                        </span>
                      )}
                      <span className="sr-only min-w-0 truncate text-sm font-semibold sm:not-sr-only">{option.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{dict.deliveryFeeNote}</p>
            </Card>
          )}


          {/* Payment method */}
          <Card>
            <CardTitle icon={CreditCard} required>
              {dict.paymentMethod}
            </CardTitle>
            {/* Phones: two tiles side by side with icon + title; the hint shows from sm up. */}
            <div role="radiogroup" aria-label={dict.paymentMethod} className="mt-3 grid grid-cols-2 gap-2">
              {methods.map((method) => {
                const Icon = PAYMENT_ICONS[method];
                const active = payment === method;
                const disabled = method === "BANK_TRANSFER" && !quote.transferAvailable;
                return (
                  <button
                    key={method}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={disabled}
                    onClick={() => setPayment(method)}
                    className={`flex items-center gap-2 rounded-xl border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:gap-3 sm:p-3 ${
                      active ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border hover:border-primary/50"
                    }`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10 ${
                        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{accountDict.paymentMethod[method]}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">{dict.paymentHints[method]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {!quote.transferAvailable && <p className="mt-2 text-xs text-muted-foreground">{dict.transferUnavailable}</p>}
          </Card>

          {/* Manual QR payment: one panel per shop, each needs its slip */}
          {isTransfer &&
            quote.shops.map(({ shop, total, transfer }) =>
              transfer ? (
                <PaymentPanel
                  key={shop.id}
                  title={interpolate(dict.payShop, { shop: shop.name })}
                  qrSrc={transfer.hasQr ? `/api/shop-qr/${shop.id}` : null}
                  amount={formatMoney(total, locale)}
                  transfer={transfer}
                  slip={slips[shop.id] ?? emptySlip}
                  onPickSlip={(file) => void pickSlip(shop.id, file)}
                  dict={dict}
                />
              ) : null,
            )}

          {/* Discount coupon */}
          <Card>
            <CardTitle icon={TicketPercent}>{dict.coupon}</CardTitle>
            {quote.coupon ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-dashed border-primary/60 bg-primary-soft px-3.5 py-2.5">
                <p className="min-w-0 text-sm font-medium text-primary">
                  {interpolate(dict.couponSaved, { code: quote.coupon.code, amount: formatMoney(quote.coupon.discount, locale) })}
                </p>
                <button
                  type="button"
                  aria-label={dict.removeCoupon}
                  title={dict.removeCoupon}
                  disabled={requoting}
                  onClick={removeCoupon}
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-white hover:text-sale disabled:opacity-40"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyCoupon();
                }}
              >
                <input
                  value={couponInput}
                  onChange={(e) => {
                    setCouponInput(e.target.value);
                    setCouponMessage(null);
                  }}
                  placeholder={dict.couponPlaceholder}
                  aria-label={dict.coupon}
                  maxLength={40}
                  autoCapitalize="characters"
                  className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3.5 text-sm uppercase outline-none transition-colors placeholder:normal-case placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/15"
                />
                <button
                  type="submit"
                  disabled={requoting || !couponInput.trim()}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
                >
                  {requoting && couponInput.trim() && <LoaderCircle className="size-4 animate-spin" />}
                  {dict.applyCoupon}
                </button>
              </form>
            )}
            {couponMessage && (
              <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-medium text-sale">
                <CircleAlert className="mt-px size-3.5 shrink-0" />
                {couponMessage}
              </p>
            )}
          </Card>

          {/* Order note */}
          <Card>
            <label className="flex flex-col gap-2">
              <CardTitle icon={MessageSquareText}>{dict.noteLabel}</CardTitle>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={dict.notePlaceholder}
                maxLength={500}
                rows={3}
                className="w-full resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </label>
          </Card>
        </div>

        {/* Summary */}
        <aside className="hidden flex-col gap-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border lg:sticky lg:top-28 lg:flex">
          <h2 className="font-semibold">{dict.summary}</h2>
          <div aria-busy={requoting} className={`flex flex-col gap-3 transition-opacity ${requoting ? "opacity-40" : ""}`}>
            <SummaryRows quote={quote} locale={locale} dict={dict} accountDict={accountDict} />
          </div>
          {slipsMissing && <SlipWarning text={dict.slipRequired} />}
          {error && <p role="alert" className="rounded-xl bg-sale/10 px-3 py-2 text-sm text-sale">{error}</p>}
          {placeButton}
        </aside>
      </div>

      {/* Phones: total + place order pinned to the bottom */}
      <div data-bottom-bar className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-card px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] lg:hidden">
        {slipsMissing && <SlipWarning text={dict.slipRequired} />}
        {error && <p role="alert" className="text-sm text-sale">{error}</p>}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{dict.total}</p>
            <p className={`truncate text-lg font-bold text-primary transition-opacity ${requoting ? "opacity-40" : ""}`}>
              {formatMoney(quote.total, locale)}
            </p>
          </div>
          {placeButton}
        </div>
      </div>

      <Modal open={picker !== null} onClose={() => setPicker(null)} closeLabel={closeLabel} size="lg">
        {picker === "list" && (
          <div className="flex flex-col gap-4">
            <h2 className="pr-8 text-xl font-bold">{dict.chooseAddress}</h2>
            <div role="radiogroup" aria-label={dict.chooseAddress} className="flex flex-col gap-2">
              {addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={a.id === address?.id}
                  onClick={() => {
                    if (a.id !== address?.id) chooseAddress(a.id);
                    setPicker(null);
                  }}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    a.id === address?.id ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border hover:border-primary/50"
                  }`}
                >
                  <AddressSummary address={a} locale={locale} defaultLabel={a.isDefault ? accountDict.defaultBadge : undefined} compact />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPicker("new")}
              className="flex items-center justify-center gap-1.5 rounded-full border border-dashed border-primary/50 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
            >
              <Plus className="size-4" />
              {dict.addAddress}
            </button>
          </div>
        )}
        {picker === "new" && (
          <AddressForm
            locale={locale}
            dict={accountDict}
            initial={null}
            isFirst={addresses.length === 0}
            onSaved={(id) => {
              if (id) chooseAddress(id);
              setPicker(null);
              router.refresh();
            }}
          />
        )}
      </Modal>
    </>
  );
}

function SlipWarning({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 text-xs font-medium text-amber-700">
      <CircleAlert className="mt-px size-3.5 shrink-0" />
      {text}
    </p>
  );
}

function SummaryRows({
  quote,
  locale,
  dict,
  accountDict,
}: {
  quote: CheckoutQuote;
  locale: Locale;
  dict: Dictionary["checkout"];
  accountDict: Dictionary["account"];
}) {
  return (
    <>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{accountDict.subtotal}</dt>
          <dd className="tabular-nums">{formatMoney(quote.subtotal, locale)}</dd>
        </div>
        {/* Always shown: ₭0 until a coupon applies (or when the code didn't work). */}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{dict.discount}</dt>
          <dd className={`tabular-nums ${quote.discountTotal > 0 ? "text-sale" : ""}`}>
            {quote.discountTotal > 0 ? "-" : ""}
            {formatMoney(quote.discountTotal, locale)}
          </dd>
        </div>
      </dl>
      <div className="flex items-baseline justify-between border-t border-dashed border-border pt-3">
        <span className="text-sm font-semibold">{dict.total}</span>
        <span className="text-xl font-bold text-primary">{formatMoney(quote.total, locale)}</span>
      </div>
    </>
  );
}

function AddressSummary({
  address,
  locale,
  defaultLabel,
  compact,
}: {
  address: AddressItem;
  locale: Locale;
  defaultLabel?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "mt-3"}>
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        {address.recipientName}
        <span className="font-normal text-muted-foreground">{formatPhone(address.phone)}</span>
        {defaultLabel && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">{defaultLabel}</span>
        )}
      </p>
      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
        {[address.line, address.village, address.district, provinceName(address.province, locale)].filter(Boolean).join(", ")}
      </p>
    </div>
  );
}

function Card({ flush, children }: { flush?: boolean; children: React.ReactNode }) {
  return (
    <section className={`overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border ${flush ? "" : "p-4"}`}>
      {children}
    </section>
  );
}

/** `required` adds the same red * as the payment slip, for sections that must be filled. */
function CardTitle({ icon: Icon, required, children }: { icon: LucideIcon; required?: boolean; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-semibold">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-4" />
      </span>
      <span>
        {children}
        {required && (
          <span aria-hidden className="ml-1 text-sale">
            *
          </span>
        )}
      </span>
    </h2>
  );
}

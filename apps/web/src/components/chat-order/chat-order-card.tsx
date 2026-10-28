"use client";

import { formatMoney, formatPhone, provinceName, type CheckoutPaymentMethod, type Locale } from "@talad/shared";
import { Banknote, CircleAlert, CircleCheck, TriangleAlert, LoaderCircle, MapPin, Minus, Package, Plus, QrCode, ShoppingBag, TicketPercent, Truck, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { AddressForm } from "@/components/account/address-book";
import { Modal } from "@/components/auth/modal";
import { emptySlip, PaymentPanel, type SlipState } from "@/components/cart/payment-panel";
import {
  cancelChatOrder,
  getChatOrder,
  placeChatOrder,
  updateChatOrder,
  uploadChatOrderSlip,
  type ChatOrderError,
} from "@/lib/chat-order-actions";
import type { ChatOrderItem, ChatOrderPatch, ChatOrderSummary, ChatOrderView } from "@/lib/chat-orders";
import { reloadIfStale } from "@/components/stale-client-reload";
import { compressImage } from "@/lib/compress-image";
import { interpolate, productPath } from "@/lib/format";

export interface ChatOrderDicts {
  chatOrder: Dictionary["chatOrder"];
  checkout: Dictionary["checkout"];
  account: Dictionary["account"];
  cartErrors: Dictionary["cartErrors"];
  close: string;
}

const PAYMENT_ICONS: Record<CheckoutPaymentMethod, typeof Banknote> = { COD: Banknote, BANK_TRANSFER: QrCode };

/**
 * Buy by chat: an order card in a chat. The customer picks the options and quantity, the
 * address, courier and payment (with the transfer slip), and places it — all inside the chat,
 * through normal checkout. Placed or removed cards show as a receipt.
 */
export function ChatOrderCard({ orderId, summary, locale, dicts }: { orderId: string; summary?: ChatOrderSummary | null; locale: Locale; dicts: ChatOrderDicts }) {
  const t = dicts.chatOrder;
  const [view, setView] = useState<ChatOrderView | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<ChatOrderError | null>(null);
  const [pending, startTransition] = useTransition();
  const [picker, setPicker] = useState<"list" | "new" | null>(null);
  /** "Place order" asks first: a placed order can't be cancelled by the customer. */
  const [confirming, setConfirming] = useState(false);
  const [slip, setSlip] = useState<SlipState>(emptySlip);
  /** Option values picked while more than one option (size + colour) is still open. */
  const [picks, setPicks] = useState<Record<number, Record<string, string>>>({});
  const closed = summary && summary.status !== "DRAFT";

  useEffect(() => {
    if (closed) return;
    let live = true;
    void getChatOrder(orderId)
      .then((res) => {
        if (!live) return;
        if (res.ok) setView(res.data);
        else setLoadFailed(true);
      })
      .catch((e: unknown) => {
        if (live) setLoadFailed(true);
        reloadIfStale(e);
      });
    return () => {
      live = false;
    };
  }, [orderId, closed]);

  const message = (e: ChatOrderError) => (t.errors as Record<string, string>)[e] ?? (dicts.cartErrors as Record<string, string>)[e] ?? dicts.cartErrors.generic;

  /** Runs a card action; a failed call (network, a page older than the server) shows an error. */
  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError("generic");
        reloadIfStale(e);
      }
    });
  }

  function patch(p: ChatOrderPatch) {
    run(async () => {
      const res = await updateChatOrder(orderId, p);
      if (res.ok) setView(res.data);
      else setError(res.error);
    });
  }

  function setItem(item: ChatOrderItem, change: { variantId?: string | null; quantity?: number }) {
    if (!view) return;
    patch({
      items: view.items.map((i) => ({
        productId: i.productId,
        variantId: i.index === item.index && change.variantId !== undefined ? change.variantId : i.variantId,
        quantity: i.index === item.index && change.quantity !== undefined ? change.quantity : i.quantity,
      })),
    });
  }

  /** A value for one option; once the picks name exactly one variant, it's chosen. */
  function pickOption(item: ChatOrderItem, name: string, value: string) {
    const current = item.variantId ? (item.variants.find((v) => v.id === item.variantId)?.attributes ?? {}) : (picks[item.index] ?? {});
    const next = { ...current, [name]: value };
    const matching = item.variants.filter((v) => Object.entries(next).every(([k, val]) => v.attributes[k] === val));
    const exact = matching.filter((v) => Object.keys(v.attributes).every((k) => k in next));
    setPicks((p) => ({ ...p, [item.index]: next }));
    if (exact.length === 1) setItem(item, { variantId: exact[0].id });
    else if (item.variantId) setItem(item, { variantId: null });
  }

  async function pickSlip(file: File) {
    setSlip({ ...emptySlip, preview: URL.createObjectURL(file), uploading: true });
    const form = new FormData();
    form.set("slip", await compressImage(file));
    const res = await uploadChatOrderSlip(orderId, form).catch((e: unknown) => {
      reloadIfStale(e);
      return { ok: false as const, error: "generic" as const };
    });
    if (res.ok) {
      setView(res.data);
      setSlip((s) => ({ ...s, uploading: false, attached: true }));
    } else setSlip((s) => ({ ...s, uploading: false, error: message(res.error) }));
  }

  function place() {
    if (!view) return;
    run(async () => {
      const res = await placeChatOrder(orderId, view.total);
      setConfirming(false);
      if (res.ok) setView(res.data);
      else {
        setError(res.error);
        // Prices or stock moved: show the current card.
        const fresh = await getChatOrder(orderId);
        if (fresh.ok) setView(fresh.data);
      }
    });
  }

  function remove() {
    if (!window.confirm(t.removeConfirm)) return;
    run(async () => {
      const res = await cancelChatOrder(orderId);
      if (res.ok) setView((v) => (v ? { ...v, status: "CANCELLED" } : v));
      else setError(res.error);
    });
  }

  // Placed or removed: a receipt.
  const status = view?.status ?? summary?.status;
  if (status && status !== "DRAFT") {
    const items = view ? view.items.map((i) => ({ name: i.name, variantLabel: i.variantLabel, quantity: i.quantity, imageUrl: i.imageUrl })) : (summary?.items ?? []);
    const number = view?.orderNumber ?? summary?.orderNumber;
    const total = view ? view.total : (summary?.total ?? 0);
    return <Receipt status={status} number={number ?? null} total={total} items={items} locale={locale} t={t} />;
  }
  if (loadFailed) {
    return (
      <Shell>
        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <CircleAlert className="size-4" /> {t.loadError}
        </p>
      </Shell>
    );
  }
  if (!view) {
    return (
      <Shell>
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
      </Shell>
    );
  }

  const address = view.addresses.find((a) => a.id === view.addressId) ?? null;
  const missing = view.missing[0];
  const priced = !view.missing.includes("OPTION");

  return (
    <Shell>
      <div className={`flex flex-col transition-opacity ${pending ? "pointer-events-none opacity-70" : ""}`}>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ShoppingBag className="size-4 text-primary" />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold">
            {t.title} · {view.shop.name}
          </p>
          <button type="button" onClick={remove} className="rounded-full px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            {t.remove}
          </button>
        </header>

        {/* Items, with their options and quantity */}
        <ul className="divide-y divide-border">
          {view.items.map((item) => (
            <li key={item.index} className="flex gap-3 px-4 py-3">
              <Link href={productPath(locale, view.shop.slug, item.productSlug)} className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
                {/* eslint-disable-next-line @next/next/no-img-element -- product photo from the media CDN */}
                {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-6" />}
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm leading-snug font-medium">{item.name}</p>
                  {/* No price until the option (size…) is chosen: options can cost different amounts. */}
                  {!item.needsOption && <p className="shrink-0 text-sm font-bold text-primary tabular-nums">{formatMoney(item.lineTotal, locale)}</p>}
                </div>
                <Options item={item} picks={picks[item.index]} onPick={(name, value) => pickOption(item, name, value)} t={t} />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center rounded-full ring-1 ring-border">
                    <button
                      type="button"
                      aria-label={t.decrease}
                      disabled={item.quantity <= 1}
                      onClick={() => setItem(item, { quantity: item.quantity - 1 })}
                      className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-40"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-label={t.quantity}>
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={t.increase}
                      disabled={item.quantity >= Math.min(view.maxQuantity, item.needsOption ? view.maxQuantity : item.stock)}
                      onClick={() => setItem(item, { quantity: item.quantity + 1 })}
                      className="flex size-8 items-center justify-center rounded-full text-foreground hover:bg-muted disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  {!item.needsOption && item.stock > 0 && item.stock <= 5 && <span className="text-xs text-sale">{interpolate(t.onlyLeft, { n: item.stock })}</span>}
                  {item.issue && !item.needsOption && <span className="text-xs text-sale">{dicts.cartErrors[item.issue === "OWN_PRODUCT" ? "OWN_PRODUCT" : item.issue === "UNAVAILABLE" ? "PRODUCT_UNAVAILABLE" : "CART_CHANGED"]}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          {/* Address */}
          <Row icon={MapPin} label={t.address}>
            {address ? (
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-sm leading-snug">
                  <span className="font-medium">{address.recipientName}</span> <span className="text-muted-foreground">{formatPhone(address.phone)}</span>
                  <br />
                  <span className="text-muted-foreground">{[address.line, address.village, address.district, provinceName(address.province, locale)].filter(Boolean).join(", ")}</span>
                </p>
                <button type="button" onClick={() => setPicker("list")} className="shrink-0 text-sm font-semibold text-primary hover:underline">
                  {t.change}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setPicker("new")} className="flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                <Plus className="size-4" /> {t.addAddress}
              </button>
            )}
          </Row>

          {/* Courier */}
          {view.delivery.options.length > 0 && (
            <Row icon={Truck} label={t.delivery}>
              <div className="flex flex-wrap gap-1.5">
                {view.delivery.options.map((o) => (
                  <Chip key={o.id} active={o.id === view.delivery.selectedId} onClick={() => patch({ deliveryProviderId: o.id })}>
                    {o.name}
                  </Chip>
                ))}
              </div>
            </Row>
          )}

          {/* Payment */}
          <Row icon={Banknote} label={t.payment}>
            <div className="flex flex-wrap gap-1.5">
              {view.paymentMethods.map((m) => {
                const Icon = PAYMENT_ICONS[m];
                return (
                  <Chip key={m} active={m === view.paymentMethod} onClick={() => patch({ paymentMethod: m })}>
                    <Icon className="size-3.5" /> {dicts.account.paymentMethod[m]}
                  </Chip>
                );
              })}
            </div>
          </Row>
          {view.paymentMethod === "BANK_TRANSFER" && view.transfer && (
            <PaymentPanel
              title={dicts.checkout.payTaladonline}
              qrSrc={view.transfer.hasQr ? "/api/payment-qr" : null}
              amount={formatMoney(view.total, locale)}
              transfer={view.transfer}
              slips={view.slipAttached && !slip.preview ? [{ ...emptySlip, attached: true }] : slip.preview ? [slip] : []}
              onPickSlip={(file) => void pickSlip(file)}
              dict={dicts.checkout}
              bare
            />
          )}

          {/* Coupon */}
          {view.coupon ? (
            <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-3 py-2 text-sm">
              <TicketPercent className="size-4 text-primary" />
              <span className="min-w-0 flex-1">
                {interpolate(t.coupon, { code: view.coupon.code })} <span className="font-semibold text-primary">−{formatMoney(view.coupon.discount, locale)}</span>
              </span>
              <button type="button" onClick={() => patch({ couponCode: "" })} aria-label={t.removeCoupon} className="rounded-full p-1 text-muted-foreground hover:bg-background">
                <X className="size-3.5" />
              </button>
            </p>
          ) : (
            view.couponRemoved && (
              <button type="button" onClick={() => patch({ couponCode: null })} className="flex items-center gap-1.5 self-start text-xs font-medium text-primary hover:underline">
                <TicketPercent className="size-3.5" /> {t.useCoupon}
              </button>
            )
          )}
        </div>

        {/* Total and Place order */}
        <footer className="flex flex-col gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{t.total}</span>
            <span className="text-lg font-bold text-primary tabular-nums">{priced ? formatMoney(view.total, locale) : "—"}</span>
          </div>
          <p className="-mt-1 text-right text-[11px] text-muted-foreground">{t.deliveryNote}</p>
          {(error || missing) && (
            <p role="alert" className="flex items-start gap-1.5 text-sm text-sale">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {error ? message(error) : t.missing[missing!]}
            </p>
          )}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={pending || !!missing}
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {priced ? interpolate(t.place, { amount: formatMoney(view.total, locale) }) : t.placeShort}
          </button>
        </footer>
      </div>

      <Modal open={confirming} onClose={() => !pending && setConfirming(false)} closeLabel={dicts.close} size="sm">
        <div className="flex flex-col gap-4">
          <h2 className="pr-8 text-xl font-bold">{t.confirmTitle}</h2>
          {/* What they're agreeing to, at a glance. */}
          <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 text-sm">
            <ul className="flex flex-col gap-1">
              {view.items.map((i) => (
                <li key={i.index} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {i.name}
                    {i.variantLabel && <span className="text-muted-foreground"> · {i.variantLabel}</span>}
                  </span>
                  <span className="shrink-0 tabular-nums">× {i.quantity}</span>
                </li>
              ))}
            </ul>
            {address && (
              <p className="flex gap-1.5 border-t border-border pt-2 text-muted-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {address.recipientName} · {[address.line, address.district, provinceName(address.province, locale)].filter(Boolean).join(", ")}
                </span>
              </p>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
              {view.delivery.selectedId && (
                <span className="flex items-center gap-1.5">
                  <Truck className="size-3.5" /> {view.delivery.options.find((o) => o.id === view.delivery.selectedId)?.name}
                </span>
              )}
              {view.paymentMethod && (
                <span className="flex items-center gap-1.5">
                  <Banknote className="size-3.5" /> {dicts.account.paymentMethod[view.paymentMethod]}
                </span>
              )}
            </p>
            <p className="flex items-baseline justify-between border-t border-border pt-2">
              <span className="text-muted-foreground">{t.total}</span>
              <span className="text-lg font-bold text-primary tabular-nums">{formatMoney(view.total, locale)}</span>
            </p>
          </div>
          <div role="alert" className="flex gap-2.5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">{t.confirmWarning}</p>
              <p className="mt-1 text-amber-800/90 dark:text-amber-300/90">{t.confirmHelp}</p>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="h-11 rounded-full px-5 text-sm font-semibold text-foreground ring-1 ring-border hover:bg-muted disabled:opacity-60"
            >
              {t.back}
            </button>
            <button
              type="button"
              onClick={place}
              disabled={pending}
              className="flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 disabled:opacity-70"
            >
              {pending && <LoaderCircle className="size-4 animate-spin" />}
              {pending ? t.placing : interpolate(t.confirm, { amount: formatMoney(view.total, locale) })}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={picker !== null} onClose={() => setPicker(null)} closeLabel={dicts.close} size="lg">
        {picker === "list" && (
          <div className="flex flex-col gap-4">
            <h2 className="pr-8 text-xl font-bold">{t.chooseAddress}</h2>
            <div role="radiogroup" aria-label={t.chooseAddress} className="flex flex-col gap-2">
              {view.addresses.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={a.id === view.addressId}
                  onClick={() => {
                    if (a.id !== view.addressId) patch({ addressId: a.id });
                    setPicker(null);
                  }}
                  className={`rounded-xl border p-3 text-left text-sm transition-colors ${a.id === view.addressId ? "border-primary bg-primary-soft ring-1 ring-primary" : "border-border hover:border-primary/50"}`}
                >
                  <p className="font-semibold">
                    {a.recipientName} <span className="font-normal text-muted-foreground">{formatPhone(a.phone)}</span>
                  </p>
                  <p className="mt-0.5 text-muted-foreground">{[a.line, a.village, a.district, provinceName(a.province, locale)].filter(Boolean).join(", ")}</p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPicker("new")}
              className="flex items-center justify-center gap-1.5 rounded-full border border-dashed border-primary/50 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
            >
              <Plus className="size-4" />
              {t.addAddress}
            </button>
          </div>
        )}
        {picker === "new" && (
          <AddressForm
            locale={locale}
            dict={dicts.account}
            initial={null}
            isFirst={view.addresses.length === 0}
            onSaved={(id) => {
              setPicker(null);
              if (id) patch({ addressId: id });
            }}
          />
        )}
      </Modal>
    </Shell>
  );
}

/** Option chips per option name (size, colour…); sold-out values are disabled. */
function Options({ item, picks, onPick, t }: { item: ChatOrderItem; picks?: Record<string, string>; onPick: (name: string, value: string) => void; t: Dictionary["chatOrder"] }) {
  if (!item.variants.length) return null;
  const chosen = item.variantId ? (item.variants.find((v) => v.id === item.variantId)?.attributes ?? {}) : (picks ?? {});
  const names = [...new Set(item.variants.flatMap((v) => Object.keys(v.attributes)))];
  return (
    <div className="flex flex-col gap-1.5">
      {names.map((name) => {
        const values = [...new Set(item.variants.map((v) => v.attributes[name]).filter(Boolean))];
        return (
          <div key={name} className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground capitalize">{chosen[name] ? `${name}:` : interpolate(t.choose, { name })}</span>
            {values.map((value) => {
              const inStock = item.variants.some((v) => v.attributes[name] === value && v.stock > 0);
              return (
                <Chip key={value} small active={chosen[name] === value} disabled={!inStock} onClick={() => onPick(name, value)} title={inStock ? undefined : t.soldOut}>
                  {value}
                </Chip>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Receipt({
  status,
  number,
  total,
  items,
  locale,
  t,
}: {
  status: "PLACED" | "CANCELLED";
  number: string | null;
  total: number;
  items: ChatOrderSummary["items"];
  locale: Locale;
  t: Dictionary["chatOrder"];
}) {
  const placed = status === "PLACED";
  return (
    <Shell muted={!placed}>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${placed ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
          {placed ? <CircleCheck className="size-5" /> : <X className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{placed ? t.placed : t.cancelled}</p>
          {placed && number && <p className="text-sm text-muted-foreground tabular-nums">{interpolate(t.placedBody, { number, amount: formatMoney(total, locale) })}</p>}
        </div>
      </div>
      <ul className="flex flex-col gap-1 border-t border-border px-4 py-2.5 text-sm">
        {items.map((i, n) => (
          <li key={n} className={`flex justify-between gap-3 ${placed ? "" : "text-muted-foreground line-through"}`}>
            <span className="min-w-0 truncate">
              {i.name}
              {i.variantLabel && <span className="text-muted-foreground"> · {i.variantLabel}</span>}
            </span>
            <span className="shrink-0 tabular-nums">× {i.quantity}</span>
          </li>
        ))}
      </ul>
      {placed && number && (
        <Link href={`/${locale}/account/orders/${number}`} className="block border-t border-border px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary-soft">
          {t.viewOrder}
        </Link>
      )}
    </Shell>
  );
}

function Shell({ muted, children }: { muted?: boolean; children: React.ReactNode }) {
  return <div className={`w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ${muted ? "ring-border opacity-80" : "ring-primary/25"}`}>{children}</div>;
}

function Row({ icon: Icon, label, children }: { icon: typeof MapPin; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  );
}

function Chip({
  active,
  disabled,
  small,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  small?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      className={`flex items-center gap-1 rounded-full font-medium ring-1 transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40 ${small ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${
        active ? "bg-primary text-primary-foreground ring-primary" : "bg-background text-foreground ring-border hover:ring-primary/50"
      }`}
    >
      {children}
    </button>
  );
}

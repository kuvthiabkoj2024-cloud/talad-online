"use client";

import type { Locale } from "@talad/shared";
import { ArrowLeft, Bot, Camera, CheckCheck, ShoppingBag, CircleAlert, LoaderCircle, Lock, Package, Plus, SendHorizontal, Store, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { ChatOrderCard, type ChatOrderDicts } from "@/components/chat-order/chat-order-card";
import { startShopChatOrder } from "@/lib/chat-order-actions";
import { reloadIfStale } from "@/components/stale-client-reload";
import { compressImage } from "@/lib/compress-image";
import { LIVE_MESSAGE_EVENT } from "@/lib/live-events";
import { formatPriceRange, interpolate, productPath } from "@/lib/format";
import { messagePhotoUrl, type ChatProductRef, type ShopChatMessage, type ShopThread } from "@/lib/messages";
import {
  fetchConversationProduct,
  fetchNewMessages,
  fetchOlderMessages,
  markConversationRead,
  sendShopMessage,
  type MessageError,
} from "@/lib/messages-actions";

type Dict = Dictionary["messages"];

/** How often the open chat checks for new messages; every second for a while after sending (the shop's bot replies in a moment). */
const POLL_MS = 4000;
const FAST_POLL_MS = 1000;
const FAST_POLLS = 10;

/** Merge by id, oldest first (polling and sending can both return the same message). */
function merge(a: ShopChatMessage[], b: ShopChatMessage[]): ShopChatMessage[] {
  const byId = new Map([...a, ...b].map((m) => [m.id, m]));
  return [...byId.values()].sort((x, y) => x.createdAt.localeCompare(y.createdAt) || x.id.localeCompare(y.id));
}

/**
 * A private chat between the signed-in customer and one shop. Only the two of them can read it
 * (the API scopes every request to the viewer); photos are streamed through the storefront.
 */
export function ShopChat({
  locale,
  dict,
  orderDicts,
  initial,
  productId,
  order,
}: {
  locale: Locale;
  dict: Dict;
  orderDicts: ChatOrderDicts;
  initial: ShopThread;
  productId: string | null;
  order: string | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState(initial.messages);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [otherReadAt, setOtherReadAt] = useState(initial.otherReadAt);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState(order ? interpolate(dict.aboutOrder, { number: order }) : "");
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [product, setProduct] = useState<ChatProductRef | null>(null);
  const [error, setError] = useState<MessageError | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  // Scroll only the message list: scrollIntoView would also scroll the page around it.
  const toBottom = () => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  /** A photo finished loading: stay at the bottom unless the customer has scrolled up to read. */
  function keepAtBottom(img: HTMLImageElement) {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < img.offsetHeight + 160) toBottom();
  }
  const lastId = useRef(initial.messages.at(-1)?.id);
  /** Fast polls left (after sending). */
  const fast = useRef(0);
  const [typing, setTyping] = useState(false);

  const time = new Intl.DateTimeFormat(locale === "lo" ? "lo-LA" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  const day = new Intl.DateTimeFormat(locale === "lo" ? "lo-LA" : "en-GB", { weekday: "short", day: "numeric", month: "short" });

  // The product the customer tapped "Chat with shop" on, as a chip above the composer.
  useEffect(() => {
    if (!productId) return;
    let live = true;
    void fetchConversationProduct(initial.id, productId).then((res) => {
      if (live && res.ok) setProduct(res.data);
    });
    return () => {
      live = false;
    };
  }, [initial.id, productId]);

  // Poll for the shop's replies while the page is visible; opening the chat marks it read.
  useEffect(() => {
    void markConversationRead(initial.id);
    let tick = 0;
    const timer = window.setInterval(() => {
      tick++;
      if (fast.current > 0) fast.current--;
      else if (tick % (POLL_MS / FAST_POLL_MS) !== 0) return;
      if (document.visibilityState !== "visible") return;
      void fetchNewMessages(initial.id, lastId.current).then((res) => {
        if (!res.ok) return;
        setOtherReadAt(res.data.otherReadAt);
        if (!res.data.messages.length) return;
        setMessages((prev) => merge(prev, res.data.messages));
        if (res.data.messages.some((m) => !m.mine)) {
          fast.current = 0;
          setTyping(false);
          void markConversationRead(initial.id);
        }
      });
      if (fast.current === 0) setTyping(false);
    }, FAST_POLL_MS);
    // A live "new message" event: check right away (within a second) instead of in 4 s.
    const onMessage = (e: Event) => {
      if ((e as CustomEvent<string>).detail === initial.id) fast.current = Math.max(fast.current, 2);
    };
    window.addEventListener(LIVE_MESSAGE_EVENT, onMessage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(LIVE_MESSAGE_EVENT, onMessage);
    };
  }, [initial.id]);

  // Keep the newest message in view.
  const count = messages.length;
  const newest = messages.at(-1)?.id;
  useEffect(() => {
    lastId.current = newest;
    toBottom();
  }, [newest, count, typing]);

  async function loadOlder() {
    const first = messages[0];
    if (!first || loadingOlder) return;
    setLoadingOlder(true);
    const res = await fetchOlderMessages(initial.id, first.id);
    setLoadingOlder(false);
    if (!res.ok) return;
    setHasMore(res.data.hasMore);
    // Keep the reading position: prepend without jumping to the bottom.
    setMessages((prev) => merge(res.data.messages, prev));
  }

  async function attach(file: File | undefined) {
    if (!file) return;
    const small = await compressImage(file, { maxSide: 1600, maxBytes: 900 * 1024 });
    setPhoto({ file: small, preview: URL.createObjectURL(small) });
    textInput.current?.focus();
  }

  function send() {
    const body = text.trim();
    if ((!body && !photo && !product) || pending) return;
    const form = new FormData();
    form.set("text", body);
    if (product) form.set("productId", product.id);
    if (photo) form.set("photo", photo.file);
    setError(null);
    startTransition(async () => {
      const res = await sendShopMessage(initial.id, form);
      if (!res.ok) {
        if (res.error === "UNAUTHENTICATED") return router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/messages/${initial.id}`)}`);
        setError(res.error);
        return;
      }
      setMessages((prev) => merge(prev, [res.data]));
      // The shop's bot answers in a moment: check every second meanwhile.
      fast.current = FAST_POLLS;
      setTyping(true);
      setText("");
      if (textInput.current) textInput.current.style.height = "auto";
      if (photo) URL.revokeObjectURL(photo.preview);
      setPhoto(null);
      setProduct(null);
      // Drop ?product / ?order so a reload doesn't bring the chip back.
      if (productId || order) router.replace(`/${locale}/messages/${initial.id}`, { scroll: false });
    });
  }

  /** "Buy" on a product in the chat: an order card appears in a moment (next poll). */
  const [buying, setBuying] = useState<string | null>(null);
  async function buy(p: ChatProductRef) {
    setBuying(p.id);
    setError(null);
    const res = await startShopChatOrder(initial.id, { productId: p.id }).catch((e: unknown) => {
      reloadIfStale(e);
      return { ok: false as const, error: "generic" as const };
    });
    setBuying(null);
    if (!res.ok) {
      if (res.error === "UNAUTHENTICATED") return router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/messages/${initial.id}`)}`);
      setError("generic");
      return;
    }
    const fresh = await fetchNewMessages(initial.id, lastId.current);
    if (fresh.ok) setMessages((prev) => merge(prev, fresh.data.messages));
  }

  function back() {
    if (window.history.length > 1) router.back();
    else router.push(`/${locale}/messages`);
  }

  // A card sent again (the bot brings back the same order) shows once, at its latest message.
  const lastOfOrder = new Map(messages.flatMap((m) => (m.order ? [[m.order.id, m.id] as const] : [])));

  return (
    // Phones: full screen like a messaging app (no site header or tab bar on this page).
    <div className="mx-auto flex h-svh w-full max-w-3xl flex-col bg-background md:my-4 md:h-[calc(100svh-var(--header-h)-2rem)] md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-card md:shadow-sm">
      {/* Chat header */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:gap-3 sm:px-4 md:pt-3">
        <button type="button" onClick={back} aria-label={dict.back} className="flex size-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted">
          <ArrowLeft className="size-5" />
        </button>
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary">
          {/* eslint-disable-next-line @next/next/no-img-element -- shop logo from the media CDN */}
          {initial.shop.logoUrl ? <img src={initial.shop.logoUrl} alt="" className="size-full object-cover" /> : <Store className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-bold leading-tight">{initial.shop.name}</h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" />
            {dict.title}
          </p>
        </div>
        <Link
          href={`/${locale}/s/${initial.shop.slug}`}
          className="shrink-0 rounded-full px-3 py-2 text-sm font-medium text-primary hover:bg-primary-soft"
        >
          {dict.viewShop}
        </Link>
      </div>

      {/* Messages */}
      <div ref={scroller} className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        <p className="mx-auto mb-4 flex w-fit max-w-[90%] items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <Lock className="size-3.5 shrink-0" />
          {interpolate(dict.private, { shop: initial.shop.name })}
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => void loadOlder()}
            disabled={loadingOlder}
            className="mx-auto mb-4 flex items-center gap-1.5 rounded-full bg-card px-4 py-2 text-sm font-semibold text-primary ring-1 ring-border hover:bg-primary-soft"
          >
            {loadingOlder && <LoaderCircle className="size-4 animate-spin" />}
            {dict.loadOlder}
          </button>
        )}
        <ol className="flex flex-col gap-1.5">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const date = new Date(m.createdAt);
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== date.toDateString();
            return (
              <li key={m.id} className="flex flex-col gap-1.5">
                {newDay && <p className="my-2 self-center rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">{day.format(date)}</p>}
                {/* Like a messaging app: the shop's messages leave room on the right, the customer's on the left. */}
                <div className={`flex flex-col gap-1 ${m.mine ? "items-end pl-[20%]" : "items-start pr-[20%]"}`}>
                  {m.bot && (
                    <span className="flex items-center gap-1 px-1 text-[11px] font-medium text-muted-foreground">
                      <Bot className="size-3.5" />
                      {dict.autoReply}
                    </span>
                  )}
                  {m.product && <ProductRef product={m.product} locale={locale} />}
                  {m.hasPhoto && (
                    <a href={messagePhotoUrl(initial.id, m.id)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private photo, streamed through the storefront */}
                      <img
                        src={messagePhotoUrl(initial.id, m.id)}
                        alt={dict.photo}
                        onLoad={(e) => keepAtBottom(e.currentTarget)}
                        className="max-h-64 w-auto max-w-[min(16rem,100%)] rounded-2xl bg-muted object-cover shadow-sm"
                      />
                    </a>
                  )}
                  {m.text && (
                    <p
                      className={`w-fit max-w-full rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap shadow-sm ${
                        m.mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card text-foreground ring-1 ring-border md:bg-muted md:ring-0"
                      }`}
                    >
                      {m.text}
                    </p>
                  )}
                  {m.order && lastOfOrder.get(m.order.id) === m.id && <ChatOrderCard key={m.order.id} orderId={m.order.id} summary={m.order} locale={locale} dicts={orderDicts} />}
                  {m.products.length > 0 && (
                    <ul className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
                      {m.products.map((p) => (
                        <li key={p.id} className="flex min-w-0">
                          <ProductTile product={p} locale={locale} buyLabel={orderDicts.chatOrder.buy} buying={buying === p.id} onBuy={() => void buy(p)} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <span className="flex items-center gap-1 px-1 text-[10px] text-muted-foreground tabular-nums">
                    {time.format(date)}
                    {m.mine && <ReadTicks read={!!otherReadAt && otherReadAt >= m.createdAt} labels={dict} />}
                  </span>
                </div>
              </li>
            );
          })}
          {typing && (
            <li className="flex pr-[20%]">
              <p
                className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-card px-4 py-3.5 ring-1 ring-border md:bg-muted md:ring-0"
                aria-label={interpolate(dict.typing, { shop: initial.shop.name })}
              >
                {[0, 150, 300].map((delay) => (
                  <span key={delay} className="size-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </p>
            </li>
          )}
        </ol>
        <div ref={end} />
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-card px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 md:pb-3">
        {error && (
          <p role="alert" className="mb-2 flex items-center gap-1.5 text-sm text-sale">
            <CircleAlert className="size-4 shrink-0" />
            {dict.errors[error]}
          </p>
        )}
        {(product || photo) && (
          <div className="mb-2 flex items-end gap-2">
            {product && (
              <div className="relative flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-muted p-2 pr-8">
                <ProductThumb product={product} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-primary">{dict.askAbout}</p>
                  <p className="truncate text-sm font-medium">{product.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setProduct(null)}
                  aria-label={dict.removeProduct}
                  className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-background"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            {photo && (
              <div className="relative w-fit shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- local photo preview */}
                <img src={photo.preview} alt="" className="size-16 rounded-xl object-cover ring-1 ring-border" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(photo.preview);
                    setPhoto(null);
                  }}
                  aria-label={dict.removePhoto}
                  className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label={dict.attach}
            title={dict.attach}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary"
          >
            {photo ? <Plus className="size-5" /> : <Camera className="size-5" />}
          </button>
          <textarea
            ref={textInput}
            rows={1}
            value={text}
            maxLength={2000}
            placeholder={dict.placeholder}
            aria-label={dict.placeholder}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl border border-border bg-background px-4 py-2.5 text-[15px] outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-4 focus:ring-primary/15"
          />
          <button
            type="submit"
            disabled={pending || (!text.trim() && !photo && !product)}
            aria-label={dict.send}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            {pending ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => {
              void attach(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </form>
      </div>
    </div>
  );
}

function ProductThumb({ product }: { product: ChatProductRef }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-muted-foreground">
      {/* eslint-disable-next-line @next/next/no-img-element -- product photo from the media CDN */}
      {product.imageUrl ? <img src={product.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-5" />}
    </span>
  );
}

/** A product the bot shows under its reply. */
function ProductTile({ product, locale, buyLabel, buying, onBuy }: { product: ChatProductRef; locale: Locale; buyLabel: string; buying: boolean; onBuy: () => void }) {
  return (
    <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/70">
    <Link href={productPath(locale, product.shopSlug, product.slug)} className="group flex flex-col">
      <span className="relative block aspect-[4/3] overflow-hidden bg-muted">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- product photo from the media CDN
          <img src={product.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground">
            <Package className="size-6" />
          </span>
        )}
      </span>
      <span className="flex flex-col gap-0.5 px-2.5 py-2">
        <span className="line-clamp-2 text-[13px] leading-snug font-medium group-hover:text-primary">{product.name}</span>
        <span className="text-sm font-bold text-primary tabular-nums">{formatPriceRange(product.price, null, locale)}</span>
      </span>
    </Link>
      <div className="mt-auto px-2.5 pb-2.5">
        <button
          type="button"
          onClick={onBuy}
          disabled={buying}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-primary text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-70"
        >
          {buying ? <LoaderCircle className="size-3.5 animate-spin" /> : <ShoppingBag className="size-3.5" />}
          {buyLabel}
        </button>
      </div>
    </div>
  );
}

/** A product the message is about: tap to open it. */
function ProductRef({ product, locale }: { product: ChatProductRef; locale: Locale }) {
  return (
    <Link
      href={productPath(locale, product.shopSlug, product.slug)}
      className="flex w-64 max-w-full items-center gap-2.5 rounded-2xl bg-card p-2 pr-3 shadow-sm ring-1 ring-border transition-colors hover:bg-muted"
    >
      <ProductThumb product={product} />
      <span className="min-w-0">
        <span className="line-clamp-2 text-sm leading-snug font-medium">{product.name}</span>
        <span className="text-sm font-bold text-primary tabular-nums">{formatPriceRange(product.price, null, locale)}</span>
      </span>
    </Link>
  );
}

/** Double check after the customer's own messages: gray until the shop opens the chat, then green. */
function ReadTicks({ read, labels }: { read: boolean; labels: { read: string; delivered: string } }) {
  return (
    <span title={read ? labels.read : labels.delivered} className={`relative ${read ? "text-primary" : "text-muted-foreground/70"}`}>
      <CheckCheck className="size-3.5" strokeWidth={2.25} aria-hidden />
      <span className="sr-only">{read ? labels.read : labels.delivered}</span>
    </span>
  );
}

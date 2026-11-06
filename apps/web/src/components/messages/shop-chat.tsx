"use client";

import type { Locale } from "@talad/shared";
import { ArrowLeft, Bot, Camera, CheckCheck, CircleAlert, LoaderCircle, Lock, MapPin, Mic, Package, Pause, Play, Plus, SendHorizontal, ShieldCheck, ShoppingBag, Store, X } from "lucide-react";
import { LocationCard } from "./location-card";
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
import { messageAudioUrl, messagePhotoUrl, type ChatProductRef, type ShopChatMessage, type ShopThread } from "@/lib/messages";
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
/** Voice messages are up to a minute. */
const MAX_VOICE_MS = 60_000;

interface Recorder {
  startedAt: number;
  stop: (keep: boolean) => void;
}

/**
 * Records the microphone until `stop`; then hands over the recording (when kept and at least
 * half a second long) and frees the microphone. Chrome/Android record WebM (Opus),
 * Safari/iPhone MP4 (AAC); 32 kbps is plenty for speech (a minute ≈ 250 KB).
 */
function record(stream: MediaStream, done: (voice: { file: File; ms: number } | null) => void): Recorder {
  const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
  const media = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 32_000 });
  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let keep = false;
  media.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  media.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const ms = Math.min(Date.now() - startedAt, MAX_VOICE_MS);
    if (!keep || ms < 500) return done(null);
    const type = media.mimeType || mimeType || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    done({ file: new File(chunks, `voice.${ext}`, { type }), ms });
  };
  media.start(250);
  return {
    startedAt,
    stop: (k) => {
      keep = k;
      if (media.state !== "inactive") media.stop();
    },
  };
}

/** "0:42". */
const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

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
  /** The current position, ready to send (shown as a chip first, like a photo). */
  const [place, setPlace] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
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
  /** Following the newest message: true until the customer scrolls up to read, true again at the bottom. */
  const pinned = useRef(true);
  const list = useRef<HTMLOListElement>(null);
  // Opening the chat lands on the newest message, and stays there while photos, product cards
  // and fonts finish loading (each makes the list taller after the first scroll).
  useEffect(() => {
    const el = scroller.current;
    const content = list.current;
    if (!el || !content) return;
    const follow = () => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    };
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    follow();
    el.addEventListener("scroll", onScroll, { passive: true });
    const observer = new ResizeObserver(follow);
    observer.observe(content);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

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
    pinned.current = true;
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

  /** Asks the browser for the current position; the customer then sends it like a photo. */
  function locate() {
    if (!("geolocation" in navigator)) return setError("LOCATION_UNAVAILABLE");
    setError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setError(err.code === err.PERMISSION_DENIED ? "LOCATION_DENIED" : "LOCATION_UNAVAILABLE");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  // ── Voice messages: up to a minute, recorded in the browser. ──
  const [recording, setRecording] = useState<{ startedAt: number } | null>(null);
  const [recordMs, setRecordMs] = useState(0);
  const recorder = useRef<Recorder | null>(null);

  async function startRecording() {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return setError("AUDIO_UNSUPPORTED");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError("MIC_DENIED");
    }
    const rec = record(stream, (voice) => {
      recorder.current = null;
      setRecording(null);
      if (voice) send(voice);
    });
    recorder.current = rec;
    setRecordMs(0);
    setRecording({ startedAt: rec.startedAt });
  }

  /** Stop recording; `keep` sends it, otherwise it's thrown away. */
  function stopRecording(keep: boolean) {
    recorder.current?.stop(keep);
  }

  // The timer while recording, and the one-minute limit (it sends on its own then).
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => {
      const ms = Date.now() - recording.startedAt;
      setRecordMs(ms);
      if (ms >= MAX_VOICE_MS) stopRecording(true);
    }, 200);
    return () => window.clearInterval(timer);
  }, [recording]);
  // Leaving the chat mid-recording drops it and frees the microphone.
  useEffect(() => () => stopRecording(false), []);

  function send(voice?: { file: File; ms: number }) {
    const body = voice ? "" : text.trim();
    if ((!body && !voice && !photo && !product && !place) || pending) return;
    const form = new FormData();
    form.set("text", body);
    if (voice) {
      form.set("audio", voice.file);
      form.set("audioMs", String(voice.ms));
    }
    if (product) form.set("productId", product.id);
    if (photo) form.set("photo", photo.file);
    if (place) {
      form.set("latitude", String(place.lat));
      form.set("longitude", String(place.lng));
    }
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
      // A voice message leaves whatever is typed or attached for the next message.
      if (voice) return;
      setText("");
      if (textInput.current) textInput.current.style.height = "auto";
      if (photo) URL.revokeObjectURL(photo.preview);
      setPhoto(null);
      setPlace(null);
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
        <ol ref={list} className="flex flex-col gap-1.5">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const date = new Date(m.createdAt);
            const newDay = !prev || new Date(prev.createdAt).toDateString() !== date.toDateString();
            if (m.system) {
              // MC Mart speaking to both sides: centred, not anyone's bubble.
              return (
                <li key={m.id} className="flex flex-col gap-1.5">
                  {newDay && <p className="my-2 self-center rounded-full bg-muted px-3 py-1 text-[11px] font-medium text-muted-foreground">{day.format(date)}</p>}
                  <div className="mx-auto my-2 w-full max-w-md rounded-2xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
                      <ShieldCheck className="size-4" />
                      MC Mart
                    </p>
                    <p className="whitespace-pre-line leading-relaxed">{m.text}</p>
                  </div>
                </li>
              );
            }
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
                  {m.location && <LocationCard lat={m.location.lat} lng={m.location.lng} label={dict.locationTitle} open={dict.openMap} />}
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
                  {m.audio && <VoiceMessage src={messageAudioUrl(initial.id, m.id)} ms={m.audio.ms} mine={m.mine} labels={dict} />}
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
        {(product || photo || place) && (
          <div className="mb-2 flex items-end gap-2">
            {place && (
              <div className="relative flex items-center gap-2 rounded-xl bg-muted py-2 pr-8 pl-3 text-sm font-medium">
                <MapPin className="size-4 shrink-0 text-sale" />
                {dict.locationReady}
                <button
                  type="button"
                  onClick={() => setPlace(null)}
                  aria-label={dict.removeLocation}
                  className="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-background"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
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
          {recording ? (
            // Recording: a timer up to a minute, cancel, and send.
            <div className="flex min-h-11 flex-1 items-center gap-3 rounded-3xl bg-sale/10 px-3" role="status">
              <button
                type="button"
                onClick={() => stopRecording(false)}
                aria-label={dict.cancelRecording}
                title={dict.cancelRecording}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background"
              >
                <X className="size-4" />
              </button>
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-sale" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{dict.recording}</span>
              <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                {clock(recordMs)} / {clock(MAX_VOICE_MS)}
              </span>
            </div>
          ) : (
            <>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label={dict.attach}
              title={dict.attach}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary"
            >
              {photo ? <Plus className="size-5" /> : <Camera className="size-5" />}
            </button>
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              aria-label={dict.shareLocation}
              title={dict.shareLocation}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-primary-soft hover:text-primary disabled:opacity-60"
            >
              {locating ? <LoaderCircle className="size-5 animate-spin" /> : <MapPin className="size-5" />}
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
            </>
          )}
          {recording ? (
            <button
              type="button"
              onClick={() => stopRecording(true)}
              aria-label={dict.sendVoice}
              title={dict.sendVoice}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110"
            >
              <SendHorizontal className="size-5" />
            </button>
          ) : !text.trim() && !photo && !product && !place ? (
            // Nothing to send yet: the button records a voice message instead.
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={pending}
              aria-label={dict.record}
              title={`${dict.record} · ${dict.recordLimit}`}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 disabled:opacity-60"
            >
              {pending ? <LoaderCircle className="size-5 animate-spin" /> : <Mic className="size-5" />}
            </button>
          ) : (
            <button
              type="submit"
              disabled={pending}
              aria-label={dict.send}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              {pending ? <LoaderCircle className="size-5 animate-spin" /> : <SendHorizontal className="size-5" />}
            </button>
          )}
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

/** A voice message: play/pause, how far along it is, and its length. */
function VoiceMessage({ src, ms, mine, labels }: { src: string; ms: number; mine: boolean; labels: Pick<Dict, "voice" | "play" | "pause"> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  // The length sent with the message, else what the file says once its details load.
  const [loaded, setLoaded] = useState(0);
  const length = ms || loaded;
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play();
    else el.pause();
  };
  return (
    <div
      className={`flex w-56 max-w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 shadow-sm ${
        mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card ring-1 ring-border md:bg-muted md:ring-0"
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? labels.pause : labels.play}
        className={`flex size-9 shrink-0 items-center justify-center rounded-full ${mine ? "bg-white/20" : "bg-primary text-primary-foreground"}`}
      >
        {playing ? <Pause className="size-4 fill-current" /> : <Play className="ml-0.5 size-4 fill-current" />}
      </button>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`h-1.5 overflow-hidden rounded-full ${mine ? "bg-white/30" : "bg-border"}`} aria-label={labels.voice}>
          <span className={`block h-full rounded-full ${mine ? "bg-white" : "bg-primary"}`} style={{ width: `${length ? Math.min(100, (at / length) * 100) : 0}%` }} />
        </span>
        <span className={`text-[11px] tabular-nums ${mine ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{clock(playing || at ? at : length)}</span>
      </span>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setAt(0);
        }}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime * 1000)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLoaded(e.currentTarget.duration * 1000)}
      />
    </div>
  );
}

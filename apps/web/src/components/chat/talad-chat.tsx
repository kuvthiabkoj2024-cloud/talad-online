"use client";

import type { Locale } from "@talad/shared";
import { ArrowLeft, Camera, ChevronDown, CircleAlert, MessagesSquare, Plus, SendHorizontal, SquarePen, Store, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { useSession } from "@/components/auth/session-provider";
import { ChatOrderCard, type ChatOrderDicts } from "@/components/chat-order/chat-order-card";
import { ChatProductCard } from "./chat-product-card";
import { reloadIfStale } from "@/components/stale-client-reload";
import { startMarketChatOrder } from "@/lib/chat-order-actions";
import { clearChatHistory, sendChat, type ChatError, type ChatProduct, type SavedChatMessage } from "@/lib/chat-actions";
import { compressImage } from "@/lib/compress-image";
import { interpolate } from "@/lib/format";

type Dict = Dictionary["chat"];

interface Msg {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Small preview of a sent photo (data URL). */
  image?: string;
  products?: ChatProduct[];
  /** Language of the reply, for its section titles. */
  lang?: Locale;
  suggestions?: string[];
  error?: ChatError;
  /** Buy by chat: an order card under this message. */
  orderId?: string;
}

/**
 * Guests: the conversation is kept on this device (last 40 messages). Signed in: it's saved
 * in the account instead (private to that customer), so nothing is stored on the device.
 */
const STORAGE_KEY = "talad_chat_guest_v1";
/** Before chats were saved per account, every visitor on a device shared this one. */
const LEGACY_KEY = "talad_chat_v1";
const MAX_STORED = 40;
const noSubscribe = () => () => {};
const readNothing = () => null;
function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
function save(messages: Msg[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // Quota or private mode: the chat still works for this visit.
  }
}
const uid = () => Math.random().toString(36).slice(2, 10);
/** Product cards shown per reply before "Show more". */
const FIRST_CARDS = 6;

/**
 * Market Chat: shop by chatting. The customer asks in Lao or English (or sends a photo); the
 * reply comes with product cards — matches first, then similar ones — to tap through.
 */
export function TaladChat({
  locale,
  dict,
  buyNow,
  cartErrors,
  saved,
  shopChats,
  orderDicts,
}: {
  locale: Locale;
  dict: Dict;
  buyNow: string;
  cartErrors: Dictionary["cartErrors"];
  /** Signed in: this account's saved conversation (oldest first). Guests: null. */
  saved: SavedChatMessage[] | null;
  /** Signed in: link to the customer's private chats with shops. */
  shopChats: { label: string; unread: number } | null;
  orderDicts: ChatOrderDicts;
}) {
  const greeting = useMemo<Msg>(() => ({ id: "greeting", role: "assistant", text: dict.greeting, suggestions: dict.suggestions }), [dict]);
  const storedRaw = useSyncExternalStore(noSubscribe, saved ? readNothing : readStored, () => null);
  const stored = useMemo(() => {
    try {
      const list = storedRaw ? (JSON.parse(storedRaw) as Msg[]) : null;
      return Array.isArray(list) && list.length ? list : null;
    } catch {
      return null;
    }
  }, [storedRaw]);
  const initial = useMemo<Msg[] | null>(
    () => (saved?.length ? [greeting, ...saved.map((m) => ({ id: m.id, role: m.role, text: m.text, image: m.image, products: m.products, lang: m.lang, orderId: m.orderId }))] : null),
    [saved, greeting],
  );
  const [local, setLocal] = useState<Msg[] | undefined>(undefined);
  // The greeting always shows the current text (saved conversations keep only its place).
  const messages = (local ?? initial ?? stored ?? [greeting]).map((m) => (m.id === "greeting" ? greeting : m));
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const textInput = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const { customer } = useSession();
  const [buying, setBuying] = useState<string | null>(null);

  /** Buy now: an order card in the chat — options, address and payment are completed on it. */
  async function buy(p: ChatProduct) {
    // Guests sign in first, then come back to the chat.
    const login = () => router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/chat`)}`);
    if (!customer) return login();
    setBuying(p.id);
    const res = await startMarketChatOrder({ productId: p.id }, locale).catch((e: unknown) => {
      reloadIfStale(e);
      return { ok: false as const, error: "generic" as const };
    });
    setBuying(null);
    if (res.ok) return update((prev) => [...prev, { id: res.data.id, role: "assistant", text: res.data.text, lang: res.data.lang, orderId: res.data.orderId }]);
    if (res.error === "UNAUTHENTICATED") return login();
    update((prev) => [...prev, { id: uid(), role: "assistant", text: (cartErrors as Record<string, string>)[res.error] ?? cartErrors.generic, error: "generic" }]);
  }

  // Keep the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pending]);

  // The shared, pre-account conversation could belong to someone else on this device.
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Storage blocked: nothing to remove.
    }
  }, []);

  function update(fn: (prev: Msg[]) => Msg[]) {
    setLocal((prev) => {
      const next = fn(prev ?? initial ?? stored ?? [greeting]);
      if (!saved) save(next);
      return next;
    });
  }

  async function attach(file: File | undefined) {
    if (!file) return;
    const small = await compressImage(file, { maxSide: 1024, maxBytes: 400 * 1024 });
    const thumb = await toDataUrl(await compressImage(small, { maxSide: 320, maxBytes: 1 }));
    setPhoto({ file: small, preview: thumb });
    textInput.current?.focus();
  }

  function send(message = text) {
    const body = message.trim();
    if ((!body && !photo) || pending) return;
    const sentPhoto = photo;
    const history = messages
      .filter((m) => m.id !== "greeting" && !m.error)
      .slice(-10)
      .map((m) => ({ role: m.role, text: m.image ? `[photo] ${m.text}`.trim() : m.text }));
    update((prev) => [...prev, { id: uid(), role: "user", text: body, image: sentPhoto?.preview }]);
    setText("");
    setPhoto(null);
    startTransition(async () => {
      const form = new FormData();
      form.set("message", body);
      form.set("history", JSON.stringify(history));
      form.set("locale", locale);
      if (sentPhoto) {
        form.set("photo", sentPhoto.file);
        form.set("thumb", sentPhoto.preview);
      }
      const res = await sendChat(form);
      update((prev) => [
        ...prev,
        res.ok
          ? { id: uid(), role: "assistant", text: res.data.reply, products: res.data.products, suggestions: res.data.suggestions, lang: res.data.lang, orderId: res.data.orderId }
          : { id: uid(), role: "assistant", text: dict.errors[res.error], error: res.error },
      ]);
    });
  }

  function newChat() {
    if (messages.length > 1 && !window.confirm(dict.newChatConfirm)) return;
    update(() => [greeting]);
    if (saved) void clearChatHistory();
  }

  const last = messages.at(-1);

  function back() {
    // Came from another page: go back to it; opened directly (new tab, shared link): go home.
    if (window.history.length > 1) router.back();
    else router.push(`/${locale}`);
  }

  return (
    // Phones: full screen like a messaging app (no site header or tab bar on this page).
    <div className="mx-auto flex h-svh w-full max-w-3xl flex-col bg-background md:my-4 md:h-[calc(100svh-var(--header-h)-2rem)] md:overflow-hidden md:rounded-3xl md:border md:border-border md:bg-card md:shadow-sm">
      {/* Chat header */}
      <div className="flex items-center gap-2 border-b border-border bg-card px-2 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 sm:gap-3 sm:px-4 md:pt-3">
        <button
          type="button"
          onClick={back}
          aria-label={dict.back}
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted md:hidden"
        >
          <ArrowLeft className="size-5" />
        </button>
        <AssistantAvatar />
        <div className="min-w-0 flex-1">
          <h1 className="font-bold leading-tight">{dict.title}</h1>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-emerald-500" />
            {dict.online}
          </p>
        </div>
        {shopChats && (
          <Link
            href={`/${locale}/messages`}
            aria-label={shopChats.unread ? `${shopChats.label} (${shopChats.unread})` : shopChats.label}
            title={shopChats.label}
            className="relative flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <MessagesSquare className="size-5" />
            {shopChats.unread > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-4.5 rounded-full bg-sale px-1 text-center text-[10px] leading-4.5 font-bold text-white">
                {shopChats.unread > 99 ? "99+" : shopChats.unread}
              </span>
            )}
          </Link>
        )}
        <button
          type="button"
          onClick={newChat}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <SquarePen className="size-4" />
          <span className="hidden sm:inline">{dict.newChat}</span>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-4" aria-live="polite">
        <ol className="flex flex-col gap-4">
          {messages.map((m) => (
            <li key={m.id} className="flex flex-col gap-2">
              {/* Like a messaging app: the shop's messages leave room on the right, the customer's on the left. */}
              <div className={`flex flex-col gap-2 ${m.role === "user" ? "items-end pl-[20%]" : "items-start pr-[20%]"}`}>
                {m.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- local photo preview (data URL)
                  <img src={m.image} alt={dict.photoSent} className="max-h-56 w-auto max-w-[min(16rem,100%)] rounded-2xl rounded-br-md object-cover shadow-sm" />
                )}
                {m.text && (
                  <p
                    className={`w-fit max-w-full rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap shadow-sm ${
                      m.role === "user"
                        ? "rounded-br-md bg-primary text-primary-foreground"
                        : m.error
                          ? "flex items-start gap-2 rounded-bl-md bg-sale/10 text-sale"
                          : "rounded-bl-md bg-card text-foreground ring-1 ring-border md:bg-muted md:ring-0"
                    }`}
                  >
                    {m.error && <CircleAlert className="mt-1 size-4 shrink-0" />}
                    {m.text}
                  </p>
                )}
              </div>
              {m.orderId && (
                <div className="mr-[12%]">
                  <ChatOrderCard orderId={m.orderId} locale={locale} dicts={orderDicts} />
                </div>
              )}
              {/* Products belong to the shop's message (room left on the right): matches, then related ones. */}
              {(["exact", "related"] as const).map((kind) => {
                const list = m.products?.filter((p) => p.exact === (kind === "exact")) ?? [];
                if (!list.length) return null;
                const key = `${m.id}:${kind}`;
                const shown = expanded.has(key) ? list : list.slice(0, FIRST_CARDS);
                return (
                  <section key={kind} className="mr-[12%] flex flex-col gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-semibold">
                      <span className={`size-2 rounded-full ${kind === "exact" ? "bg-primary" : "bg-muted-foreground/50"}`} />
                      {/* In the language the customer chats in, whatever the app language. */}
                      {dict.sections[m.lang ?? locale][kind === "exact" ? "matches" : "related"]}
                      <span className="font-normal text-muted-foreground">({list.length})</span>
                    </h3>
                    <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
                      {shown.map((p) => (
                        <li key={p.id} className="flex min-w-0">
                          <ChatProductCard product={p} locale={locale} buyNow={buyNow} buying={buying === p.id} onBuy={() => void buy(p)} />
                        </li>
                      ))}
                    </ul>
                    {list.length > shown.length && (
                      <button
                        type="button"
                        onClick={() => setExpanded((prev) => new Set(prev).add(key))}
                        className="flex items-center justify-center gap-1 self-center rounded-full bg-card px-4 py-2 text-sm font-semibold text-primary ring-1 ring-border hover:bg-primary-soft"
                      >
                        {interpolate(dict.showMore, { n: list.length - shown.length })}
                        <ChevronDown className="size-4" />
                      </button>
                    )}
                  </section>
                );
              })}
              {/* Quick replies only under the latest message. */}
              {m === last && !pending && !!m.suggestions?.length && (
                <div className="flex flex-wrap gap-2 pr-[12%]">
                  {m.suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full bg-primary-soft px-3.5 py-2 text-sm font-medium text-primary ring-1 ring-primary/20 transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </li>
          ))}
          {pending && (
            <li className="flex">
              <p className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-card px-4 py-3.5 ring-1 ring-border md:bg-muted md:ring-0" aria-label={dict.typing}>
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
        {photo && (
          <div className="relative mb-2 w-fit">
            {/* eslint-disable-next-line @next/next/no-img-element -- local photo preview */}
            <img src={photo.preview} alt="" className="size-20 rounded-xl object-cover ring-1 ring-border" />
            <button
              type="button"
              onClick={() => setPhoto(null)}
              aria-label={dict.removePhoto}
              className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-foreground text-background shadow"
            >
              <X className="size-3.5" />
            </button>
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
            maxLength={500}
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
            disabled={pending || (!text.trim() && !photo)}
            aria-label={dict.send}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            <SendHorizontal className="size-5" />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void attach(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </form>
        <p className="mt-1.5 text-center text-[11px] text-muted-foreground">{dict.disclaimer}</p>
      </div>
    </div>
  );
}

/** The Taladonline logo, as in the site header (white shop on brand green). */
function AssistantAvatar() {
  return (
    <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
      <Store className="size-5.5" strokeWidth={2.25} />
    </span>
  );
}

function toDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

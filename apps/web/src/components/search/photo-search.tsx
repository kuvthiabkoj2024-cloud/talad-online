"use client";

import type { Locale } from "@talad/shared";
import { Camera, CircleAlert, Focus, ImageUp, LoaderCircle, RotateCcw, ScanSearch, Search, Sparkles, Sun, Wand2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { ProductCard } from "@/components/product-card";
import { compressImage } from "@/lib/compress-image";
import { interpolate } from "@/lib/format";
import { searchByPhoto, type PhotoSearchError, type PhotoSearchResult } from "@/lib/search-actions";

/** The last search survives a visit to a product page and back (this tab only). */
// v2: results now carry `related` (older saved results are ignored).
const SESSION_KEY = "talad_photo_search_v2";
/** Restore only a recent search (the "back from a product" case); otherwise start fresh. */
const RESTORE_FOR_MS = 20 * 60_000;

interface Saved {
  preview: string;
  result: PhotoSearchResult;
  savedAt: number;
}

type Dict = Dictionary["scan"];

const noSubscribe = () => () => {};
/** The saved search, if it's recent and in the current format (clock read here, outside render). */
function readSaved(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    return saved && Array.isArray(saved.result?.related) && Date.now() - (saved.savedAt ?? 0) < RESTORE_FOR_MS ? raw : null;
  } catch {
    return null;
  }
}

/**
 * "Scan to search": take or pick a photo, it is downsized in the browser (≤1024 px) and
 * matched against product photos; results show how close each match is.
 */
export function PhotoSearch({ locale, dict, soldLabel }: { locale: Locale; dict: Dict; soldLabel: string }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  // The previous search (restored after "back" from a product) until a new one replaces it.
  const savedRaw = useSyncExternalStore(noSubscribe, readSaved, () => null);
  const saved = useMemo(() => {
    try {
      return savedRaw ? (JSON.parse(savedRaw) as Saved) : null;
    } catch {
      return null;
    }
  }, [savedRaw]);
  const [current, setCurrent] = useState<{ preview: string | null; result: PhotoSearchResult | null } | undefined>(undefined);
  const preview = current ? current.preview : (saved?.preview ?? null);
  const result = current ? current.result : (saved?.result ?? null);
  const [error, setError] = useState<PhotoSearchError | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();

  function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      const small = await compressImage(file, { maxSide: 1024, maxBytes: 400 * 1024 });
      const url = await toDataUrl(small);
      setCurrent({ preview: url, result: null });
      const form = new FormData();
      form.set("file", small);
      const res = await searchByPhoto(form);
      if (!res.ok) return setError(res.error);
      setCurrent({ preview: url, result: res.result });
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ preview: url, result: res.result, savedAt: Date.now() } satisfies Saved));
      } catch {
        // Large previews can exceed the quota; the search itself still works.
      }
    });
  }

  function reset() {
    setCurrent({ preview: null, result: null });
    setError(null);
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
  }

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={gallery} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
    </>
  );

  // Start screen (also shown again after an error).
  if (!preview || (error && !pending)) {
    return (
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files?.[0]);
        }}
        className={`relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#43a047] via-[#2e7d32] to-[#1b5e20] px-5 py-10 text-white sm:px-10 sm:py-14 ${dragging ? "ring-4 ring-white/60" : ""}`}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(rgb(255_255_255/0.14)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 text-center">
          <ScanFrame>
            <ScanSearch className="size-14 sm:size-16" strokeWidth={1.5} />
          </ScanFrame>
          <div>
            <h1 className="text-2xl font-bold sm:text-4xl">{dict.title}</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/85 sm:text-base">{dict.subtitle}</p>
          </div>
          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-xl bg-white/95 px-4 py-2.5 text-sm font-medium text-sale">
              <CircleAlert className="size-4 shrink-0" />
              {dict.errors[error]}
            </p>
          )}
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <button
              type="button"
              onClick={() => camera.current?.click()}
              className="flex h-13 items-center justify-center gap-2 rounded-full bg-white px-7 text-base font-semibold text-primary shadow-lg shadow-black/15 transition hover:brightness-95"
            >
              <Camera className="size-5" />
              {dict.takePhoto}
            </button>
            <button
              type="button"
              onClick={() => gallery.current?.click()}
              className="flex h-13 items-center justify-center gap-2 rounded-full bg-white/15 px-7 text-base font-semibold ring-1 ring-white/40 transition hover:bg-white/25"
            >
              <ImageUp className="size-5" />
              {dict.choosePhoto}
            </button>
          </div>
          <p className="hidden text-sm text-white/70 md:block">{dict.drop}</p>
          <ul className="grid w-full grid-cols-3 gap-2 text-xs sm:gap-3 sm:text-sm">
            {[
              { icon: Focus, text: dict.tip1 },
              { icon: Sun, text: dict.tip2 },
              { icon: Wand2, text: dict.tip3 },
            ].map((t) => (
              <li key={t.text} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/10 px-2 py-3 ring-1 ring-white/15">
                <t.icon className="size-5" />
                {t.text}
              </li>
            ))}
          </ul>
        </div>
        {inputs}
      </section>
    );
  }

  // Searching: the photo with a moving scan line.
  if (pending || !result) {
    return (
      <section className="flex flex-col items-center gap-5 rounded-3xl bg-card px-5 py-10 ring-1 ring-border">
        <ScanFrame light>
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview (data URL) */}
          <img src={preview} alt="" className="size-full rounded-2xl object-cover" />
          <span aria-hidden className="absolute inset-x-3 h-0.5 animate-[scan-line_1.6s_ease-in-out_infinite_alternate] rounded-full bg-primary shadow-[0_0_16px_4px_rgb(46_125_50/0.6)]" />
        </ScanFrame>
        <p className="flex items-center gap-2 font-semibold" aria-live="polite">
          <LoaderCircle className="size-5 animate-spin text-primary" />
          {dict.searching}
        </p>
        {inputs}
      </section>
    );
  }

  const related = result.related ?? [];
  const found =
    result.items.length === 1
      ? dict.foundOne
      : result.items.length
        ? interpolate(dict.found, { n: result.items.length })
        : related.length
          ? dict.noExact
          : dict.noMatch;
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:self-start">
        <div className="flex gap-4 rounded-3xl bg-card p-4 ring-1 ring-border lg:flex-col">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview (data URL) */}
          <img src={preview} alt="" className="size-24 shrink-0 rounded-2xl object-cover sm:size-28 lg:aspect-square lg:size-auto lg:w-full" />
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <p className="text-lg font-bold">{found}</p>
              {result.label && (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Sparkles className="size-4 shrink-0 text-primary" />
                  {interpolate(dict.looksLike, { label: result.label })}
                </p>
              )}
            </div>
            {result.keywords.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{dict.keywordsTitle}</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.keywords.slice(0, 6).map((k) => (
                    <Link
                      key={k}
                      href={`/${locale}/search?q=${encodeURIComponent(k)}`}
                      className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground"
                    >
                      <Search className="size-3" />
                      {k}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-110 lg:w-full"
            >
              <RotateCcw className="size-4" />
              {dict.again}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex flex-col gap-6">
        {!result.items.length && !related.length && (
          <div className="flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-14 text-center ring-1 ring-border">
            <ScanSearch className="size-10 text-muted-foreground" />
            <p className="font-semibold">{dict.noMatch}</p>
            <p className="max-w-sm text-sm text-muted-foreground">{dict.noMatchHint}</p>
          </div>
        )}
        {!result.items.length && !!related.length && <p className="text-sm text-muted-foreground">{dict.relatedHint}</p>}
        {(
          [
            ["matches", dict.matchesTitle, result.items],
            ["related", dict.relatedTitle, related],
          ] as const
        ).map(
          ([kind, title, list]) =>
            !!list.length && (
              <section key={kind} aria-labelledby={`photo-${kind}`} className="flex flex-col gap-3">
                <h2 id={`photo-${kind}`} className="flex items-center gap-2 text-lg font-bold">
                  <span className={`size-2.5 rounded-full ${kind === "matches" ? "bg-primary" : "bg-muted-foreground/50"}`} />
                  {title}
                  <span className="text-sm font-normal text-muted-foreground">({list.length})</span>
                </h2>
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-4">
                  {list.map((p) => (
                    <li key={p.id} className="flex">
                      <ProductCard product={p} locale={locale} soldLabel={soldLabel} />
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
      </div>
      {inputs}
    </div>
  );
}

/** Square viewfinder with scanner corner brackets. */
function ScanFrame({ children, light }: { children: React.ReactNode; light?: boolean }) {
  const corner = `absolute size-7 border-[3px] ${light ? "border-primary" : "border-white"}`;
  return (
    <div className={`relative flex size-40 items-center justify-center overflow-hidden rounded-3xl p-3 sm:size-48 ${light ? "bg-muted" : "bg-white/10"}`}>
      <span aria-hidden className={`${corner} top-0 left-0 rounded-tl-3xl border-r-0 border-b-0`} />
      <span aria-hidden className={`${corner} top-0 right-0 rounded-tr-3xl border-b-0 border-l-0`} />
      <span aria-hidden className={`${corner} bottom-0 left-0 rounded-bl-3xl border-t-0 border-r-0`} />
      <span aria-hidden className={`${corner} right-0 bottom-0 rounded-br-3xl border-t-0 border-l-0`} />
      {children}
    </div>
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

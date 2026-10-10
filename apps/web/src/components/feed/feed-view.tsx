"use client";

import { formatMoney, type Locale } from "@talad/shared";
import { Clapperboard, Play, Store, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { FeedItem } from "@/lib/api";
import { loadFeed } from "@/lib/feed-actions";
import { formatPriceRange, productPath } from "@/lib/format";
import { ProductImage } from "../product-image";
import { FEED_HEIGHT } from "./feed-height";

type Dict = Dictionary["feed"];

/**
 * Full-screen vertical video feed: one product video per screen, snap scrolling.
 * The slide on screen plays (muted until the viewer turns sound on); the next page
 * loads when the viewer is two slides from the end.
 */
export function FeedView({
  locale,
  dict,
  initialItems,
  initialCursor,
}: {
  locale: Locale;
  dict: Dict;
  initialItems: FeedItem[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items.length]);

  useEffect(() => {
    if (!cursor || loading || loadFailed || active < items.length - 2) return;
    startLoading(async () => {
      const page = await loadFeed(cursor);
      if (!page) {
        setLoadFailed(true);
        return;
      }
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(page.nextCursor);
    });
  }, [active, cursor, items.length, loading, loadFailed]);

  if (items.length === 0) {
    return (
      <div className={`${FEED_HEIGHT} flex flex-col items-center justify-center gap-3 px-6 text-center`}>
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Clapperboard className="size-8" />
        </span>
        <h1 className="text-lg font-bold">{dict.empty}</h1>
        <p className="max-w-xs text-sm text-muted-foreground">{dict.emptyBody}</p>
        <Link
          href={`/${locale}`}
          className="mt-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
        >
          {dict.backHome}
        </Link>
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      className={`${FEED_HEIGHT} no-scrollbar snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black`}
    >
      <h1 className="sr-only">{dict.title}</h1>
      {items.map((item, i) => (
        <FeedSlide
          key={item.id}
          index={i}
          item={item}
          locale={locale}
          dict={dict}
          active={i === active}
          preload={i === active + 1}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
        />
      ))}
      {loadFailed && (
        <p role="alert" className="py-6 text-center text-sm text-white/70">
          {dict.loadError}
        </p>
      )}
    </div>
  );
}

function FeedSlide({
  index,
  item,
  locale,
  dict,
  active,
  preload,
  muted,
  onToggleMute,
}: {
  index: number;
  item: FeedItem;
  locale: Locale;
  dict: Dict;
  active: boolean;
  preload: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  // Landscape clips are letterboxed instead of cropped to the phone's shape.
  const [landscape, setLandscape] = useState(false);
  const href = productPath(locale, item.shop.slug, item.slug);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) {
      // Autoplay can be refused (e.g. low-power mode); the play button stays up then.
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [active]);

  function togglePlay() {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  return (
    <section data-index={index} aria-label={item.name} className="relative h-full snap-start snap-always">
      <div className="relative mx-auto h-full max-w-md overflow-hidden">
        <video
          ref={video}
          src={item.videoUrl}
          poster={item.imageUrl ?? undefined}
          muted={muted}
          loop
          playsInline
          preload={active || preload ? "auto" : "none"}
          onPlay={() => setPaused(false)}
          onPause={() => setPaused(true)}
          onLoadedMetadata={(e) => setLandscape(e.currentTarget.videoWidth > e.currentTarget.videoHeight)}
          onClick={togglePlay}
          aria-label={paused ? dict.play : dict.pause}
          className={`absolute inset-0 size-full cursor-pointer ${landscape ? "object-contain" : "object-cover"}`}
        />

        {active && paused && (
          <button
            type="button"
            onClick={togglePlay}
            aria-label={dict.play}
            className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
          >
            <Play className="ml-1 size-8 fill-current" />
          </button>
        )}

        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? dict.unmute : dict.mute}
          aria-pressed={!muted}
          className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm"
        >
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-linear-to-t from-black/85 via-black/40 to-transparent px-4 pb-4 pt-20 text-white">
          <Link
            href={`/${locale}/s/${item.shop.slug}`}
            className="pointer-events-auto flex w-fit items-center gap-2 text-sm font-semibold"
          >
            <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-primary ring-2 ring-white">
              {item.shop.logoUrl ? (
                <ProductImage src={item.shop.logoUrl} alt="" sizes="36px" className="object-cover" />
              ) : (
                <Store className="size-5" />
              )}
            </span>
            {item.shop.name}
          </Link>

          <p className="line-clamp-2 text-sm text-white/90">{item.name}</p>

          <Link
            href={href}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white/95 p-2 pr-3 text-foreground shadow-lg"
          >
            <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
              {item.imageUrl && <ProductImage src={item.imageUrl} alt="" sizes="48px" className="object-cover" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-bold text-sale">
                {formatPriceRange(item.price, item.priceMax, locale)}
              </span>
              {item.compareAtPrice && (
                <span className="block text-xs text-muted-foreground line-through">
                  {formatMoney(item.compareAtPrice, locale)}
                </span>
              )}
            </span>
            <span className="shrink-0 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
              {dict.viewProduct}
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

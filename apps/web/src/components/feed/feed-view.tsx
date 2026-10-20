"use client";

import { formatMoney, type Locale } from "@talad/shared";
import {
  Clapperboard,
  Eye,
  Heart,
  MessageCircle,
  Play,
  Share2,
  ShoppingBag,
  Store,
  Volume2,
  VolumeX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { FeedItem, VideoStats } from "@/lib/api";
import { loadFeed } from "@/lib/feed-actions";
import { formatCount, formatPriceRange, interpolate, productPath } from "@/lib/format";
import { favoritedVideos, recordVideoShare, recordVideoView, setVideoFavorite } from "@/lib/video-actions";
import { useSession } from "../auth/session-provider";
import { ProductImage } from "../product-image";
import { BuyNowSheet } from "./buy-now-sheet";
import { CommentsSheet } from "./comments-sheet";
import { FEED_HEIGHT } from "./feed-height";
import { ShareSheet } from "./share-sheet";

type Dict = Dictionary["feed"];
type Sheet = { kind: "comments" | "share" | "buy"; item: FeedItem } | null;

/** A play counts after this much watching, once per video per visit. */
const VIEW_AFTER_MS = 2500;
const VIEWED_KEY = "talad:feed-viewed";
const EMPTY = new Set<string>();

/**
 * Full-screen vertical video feed: one product video per screen, snap scrolling.
 * The slide on screen plays (muted until the viewer turns sound on); the next page
 * loads when the viewer is two slides from the end.
 */
export function FeedView({
  locale,
  dict,
  cartErrors,
  initialItems,
  initialCursor,
}: {
  locale: Locale;
  dict: Dict;
  cartErrors: Dictionary["cartErrors"];
  initialItems: FeedItem[];
  initialCursor: string | null;
}) {
  const router = useRouter();
  const { customer } = useSession();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, startLoading] = useTransition();
  const scroller = useRef<HTMLDivElement>(null);
  // Live counters and this viewer's favorites, layered over the (cached) feed data.
  const [stats, setStats] = useState<Record<string, VideoStats>>({});
  // Favorites belong to whoever is signed in; switching accounts starts from an empty set.
  const [favoriteState, setFavoriteState] = useState<{
    owner: string | null;
    ids: Set<string>;
  }>({ owner: null, ids: new Set() });
  const owner = customer?.id ?? null;
  const favorited = favoriteState.owner === owner ? favoriteState.ids : EMPTY;
  const setFavorited = useCallback(
    (update: (prev: Set<string>) => Set<string>) =>
      setFavoriteState((s) => ({
        owner,
        ids: update(s.owner === owner ? s.ids : new Set()),
      })),
    [owner],
  );
  const [sheet, setSheet] = useState<Sheet>(null);
  const checkedFavorites = useRef<{ owner: string | null; ids: Set<string> }>({
    owner: null,
    ids: new Set(),
  });

  const statsOf = useCallback((item: FeedItem) => stats[item.id] ?? item.stats, [stats]);
  const bump = useCallback(
    (item: FeedItem, patch: Partial<VideoStats> | ((s: VideoStats) => Partial<VideoStats>)) =>
      setStats((all) => {
        const cur = all[item.id] ?? item.stats;
        return {
          ...all,
          [item.id]: {
            ...cur,
            ...(typeof patch === "function" ? patch(cur) : patch),
          },
        };
      }),
    [],
  );

  // Which videos this viewer has favorited — fetched per page since the feed itself is cached for everyone.
  useEffect(() => {
    if (!owner) return;
    const checked = checkedFavorites.current;
    if (checked.owner !== owner) checkedFavorites.current = { owner, ids: new Set() };
    const ids = items.map((i) => i.id).filter((id) => !checkedFavorites.current.ids.has(id));
    if (!ids.length) return;
    ids.forEach((id) => checkedFavorites.current.ids.add(id));
    void favoritedVideos(ids).then((on) => setFavorited((prev) => new Set([...prev, ...on])));
  }, [owner, items, setFavorited]);

  const onViewed = useCallback(
    (item: FeedItem) => {
      let seen: string[] = [];
      try {
        seen = JSON.parse(sessionStorage.getItem(VIEWED_KEY) ?? "[]") as string[];
      } catch {
        // storage unavailable: still count, just without per-visit dedupe
      }
      if (seen.includes(item.id)) return;
      try {
        sessionStorage.setItem(VIEWED_KEY, JSON.stringify([...seen, item.id].slice(-500)));
      } catch {
        // ignore
      }
      bump(item, (s) => ({ views: s.views + 1 }));
      void recordVideoView(item.id).then((views) => views !== null && bump(item, { views }));
    },
    [bump],
  );

  async function toggleFavorite(item: FeedItem) {
    if (!customer) {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/feed`)}`);
      return;
    }
    const on = !favorited.has(item.id);
    const apply = (value: boolean) =>
      setFavorited((prev) => {
        const next = new Set(prev);
        if (value) next.add(item.id);
        else next.delete(item.id);
        return next;
      });
    apply(on);
    bump(item, (s) => ({
      favorites: Math.max(0, s.favorites + (on ? 1 : -1)),
    }));
    const res = await setVideoFavorite(item.id, on);
    if (res.ok) bump(item, { favorites: res.favorites });
    else {
      apply(!on);
      bump(item, (s) => ({
        favorites: Math.max(0, s.favorites + (on ? -1 : 1)),
      }));
      if (res.error === "UNAUTHENTICATED")
        router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/feed`)}`);
    }
  }

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

  const shareUrl =
    sheet && typeof window !== "undefined"
      ? `${window.location.origin}${productPath(locale, sheet.item.shop.slug, sheet.item.slug)}`
      : "";

  return (
    <>
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
            stats={statsOf(item)}
            favorited={favorited.has(item.id)}
            onViewed={() => onViewed(item)}
            onFavorite={() => void toggleFavorite(item)}
            onOpen={(kind) => setSheet({ kind, item })}
          />
        ))}
        {loadFailed && (
          <p role="alert" className="py-6 text-center text-sm text-white/70">
            {dict.loadError}
          </p>
        )}
      </div>

      {/* Each sheet mounts when it opens, so it starts fresh and loads live data. */}
      {sheet?.kind === "comments" && (
        <CommentsSheet
          key={sheet.item.id}
          open
          onClose={() => setSheet(null)}
          productId={sheet.item.id}
          total={statsOf(sheet.item).comments}
          locale={locale}
          dict={dict}
          onCountChange={(d) => bump(sheet.item, (s) => ({ comments: Math.max(0, s.comments + d) }))}
        />
      )}
      {sheet?.kind === "share" && (
        <ShareSheet
          key={sheet.item.id}
          open
          onClose={() => setSheet(null)}
          url={shareUrl}
          title={sheet.item.name}
          dict={dict}
          onShared={() => {
            const item = sheet.item;
            bump(item, (s) => ({ shares: s.shares + 1 }));
            void recordVideoShare(item.id).then((shares) => shares !== null && bump(item, { shares }));
          }}
        />
      )}
      {sheet?.kind === "buy" && (
        <BuyNowSheet
          key={sheet.item.id}
          open
          onClose={() => setSheet(null)}
          item={sheet.item}
          locale={locale}
          dict={dict}
          cartErrors={cartErrors}
        />
      )}
    </>
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
  stats,
  favorited,
  onViewed,
  onFavorite,
  onOpen,
}: {
  index: number;
  item: FeedItem;
  locale: Locale;
  dict: Dict;
  active: boolean;
  preload: boolean;
  muted: boolean;
  onToggleMute: () => void;
  stats: VideoStats;
  favorited: boolean;
  onViewed: () => void;
  onFavorite: () => void;
  onOpen: (kind: "comments" | "share" | "buy") => void;
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

  // Count a view once the slide has actually played for a moment.
  useEffect(() => {
    if (!active || paused) return;
    const t = setTimeout(onViewed, VIEW_AFTER_MS);
    return () => clearTimeout(t);
  }, [active, paused, onViewed]);

  const [pop, setPop] = useState(false);
  function favorite() {
    if (!favorited) {
      setPop(true);
      setTimeout(() => setPop(false), 300);
    }
    onFavorite();
  }

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
          <div className="flex items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
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
              <p className="flex items-center gap-1.5 text-xs text-white/75">
                <Eye className="size-3.5" />
                {interpolate(dict.views, {
                  n: formatCount(stats.views, locale),
                })}
              </p>
            </div>

            {/* Engagement rail */}
            <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-4 pb-1">
              <RailButton
                label={favorited ? dict.unfavorite : dict.favorite}
                pressed={favorited}
                count={formatCount(stats.favorites, locale)}
                onClick={favorite}
              >
                <Heart
                  className={`size-7 transition-transform duration-200 ${favorited ? "fill-[#ff3b5c] text-[#ff3b5c]" : ""} ${pop ? "scale-125" : ""}`}
                />
              </RailButton>
              <RailButton
                label={dict.comments}
                count={formatCount(stats.comments, locale)}
                onClick={() => onOpen("comments")}
              >
                <MessageCircle className="size-7" />
              </RailButton>
              <RailButton label={dict.share} count={formatCount(stats.shares, locale)} onClick={() => onOpen("share")}>
                <Share2 className="size-7" />
              </RailButton>
            </div>
          </div>

          {/* Floating product card: tap the card for details, Buy now to purchase from the video. */}
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-white/95 p-2 pr-2.5 text-foreground shadow-lg">
            <Link href={href} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-muted">
                {item.imageUrl && <ProductImage src={item.imageUrl} alt="" sizes="48px" className="object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-sale">
                  {formatPriceRange(item.price, item.priceMax, locale)}
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {item.compareAtPrice && (
                    <span className="text-muted-foreground line-through">
                      {formatMoney(item.compareAtPrice, locale)}
                    </span>
                  )}
                  <span className={item.stock > 0 ? "text-muted-foreground" : "font-semibold text-sale"}>
                    {item.stock > 0 ? interpolate(dict.stock, { n: item.stock }) : dict.outOfStock}
                  </span>
                </span>
              </span>
            </Link>
            <button
              type="button"
              disabled={item.stock <= 0}
              onClick={() => onOpen("buy")}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              <ShoppingBag className="hidden size-4 min-[400px]:block" />
              {item.stock > 0 ? dict.buyNow : dict.outOfStock}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RailButton({
  label,
  count,
  pressed,
  onClick,
  children,
}: {
  label: string;
  count: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label} (${count})`}
      aria-pressed={pressed}
      className="flex flex-col items-center gap-0.5 text-xs font-semibold drop-shadow-[0_1px_2px_rgb(0_0_0/0.6)] active:scale-95"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-black/25 backdrop-blur-sm">
        {children}
      </span>
      <span className="tabular-nums">{count}</span>
    </button>
  );
}

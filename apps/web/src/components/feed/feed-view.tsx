"use client";

import { formatMoney, type Locale } from "@talad/shared";
import {
  Check,
  Clapperboard,
  Eye,
  Heart,
  MessageCircle,
  Play,
  Plus,
  Share2,
  ShoppingBag,
  Store,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { FeedEntry, FeedItem, FeedPostItem, PostStats, VideoStats } from "@/lib/api";
import { loadFeed } from "@/lib/feed-actions";
import { followedProfiles, followedShops, setFollow, setProfileFollow } from "@/lib/follow-actions";
import { formatCount, formatPriceRange, interpolate, productPath } from "@/lib/format";
import {
  deletePost,
  favoritedVideos,
  likedPosts,
  recordPostShare,
  recordPostView,
  recordVideoShare,
  recordVideoView,
  setPostLike,
  setVideoFavorite,
} from "@/lib/video-actions";
import { useSession } from "../auth/session-provider";
import { ProductImage } from "../product-image";
import { BuyNowSheet } from "./buy-now-sheet";
import { CommentsSheet } from "./comments-sheet";
import { FEED_HEIGHT } from "./feed-height";
import { ShareSheet } from "./share-sheet";

type Dict = Dictionary["feed"];

/** A customer's own video (no product), as opposed to a shop's product video. */
const isPost = (e: FeedEntry): e is FeedPostItem => e.kind === "post";
type Focus = { thread: string; reply?: string };
type Sheet =
  | { kind: "buy"; item: FeedItem }
  | { kind: "comments"; item: FeedEntry; focus?: Focus }
  | { kind: "share"; item: FeedEntry }
  | null;
/** Shops and customers the viewer follows, per signed-in account. */
type Follows = { owner: string | null; shops: Set<string>; people: Set<string> };

/** A play counts after this much watching, once per video per visit. */
const VIEW_AFTER_MS = 2500;
const VIEWED_KEY = "talad:feed-viewed";
const EMPTY = new Set<string>();

/**
 * Full-screen vertical video feed: shops' product videos and customers' own videos, one per
 * screen, snap scrolling.
 * The slide on screen plays with sound (muted only until the first tap where the browser
 * refuses sound before any interaction); the next page
 * loads when the viewer is two slides from the end. `openComments` (a notification's link)
 * opens the first video's comments on that comment.
 */
export function FeedView({
  locale,
  dict,
  cartErrors,
  initialItems,
  initialCursor,
  openComments,
}: {
  locale: Locale;
  dict: Dict;
  cartErrors: Dictionary["cartErrors"];
  initialItems: FeedEntry[];
  initialCursor: string | null;
  openComments?: Focus;
}) {
  const router = useRouter();
  const { customer } = useSession();
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [active, setActive] = useState(0);
  // Sound is on; it only goes off when the browser refuses autoplay with sound (no tap yet).
  const [muted, setMuted] = useState(false);
  const activeRef = useRef(0);
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
  const [sheet, setSheet] = useState<Sheet>(() =>
    openComments && initialItems[0] ? { kind: "comments", item: initialItems[0], focus: openComments } : null,
  );
  const [followState, setFollowState] = useState<Follows>({ owner: null, shops: new Set(), people: new Set() });
  const follows = followState.owner === owner ? followState : { owner, shops: EMPTY, people: EMPTY };
  const checkedFollows = useRef<{ owner: string | null; ids: Set<string> }>({ owner: null, ids: new Set() });
  const checkedFavorites = useRef<{ owner: string | null; ids: Set<string> }>({
    owner: null,
    ids: new Set(),
  });
  // Customers' posts: live counters and which ones this viewer liked (per account, like favorites).
  const [postStats, setPostStats] = useState<Record<string, PostStats>>({});
  const [likeState, setLikeState] = useState<{ owner: string | null; ids: Set<string> }>({ owner: null, ids: new Set() });
  const liked = likeState.owner === owner ? likeState.ids : EMPTY;
  const checkedLikes = useRef<{ owner: string | null; ids: Set<string> }>({ owner: null, ids: new Set() });
  const postStatsOf = (p: FeedPostItem) => postStats[p.id] ?? p.stats;
  const bumpPost = useCallback(
    (p: FeedPostItem, patch: (s: PostStats) => Partial<PostStats>) =>
      setPostStats((all) => {
        const cur = all[p.id] ?? p.stats;
        return { ...all, [p.id]: { ...cur, ...patch(cur) } };
      }),
    [],
  );
  const loginNext = () => router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/feed`)}`);

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
    const ids = items
      .filter((i) => !isPost(i))
      .map((i) => i.id)
      .filter((id) => !checkedFavorites.current.ids.has(id));
    if (!ids.length) return;
    ids.forEach((id) => checkedFavorites.current.ids.add(id));
    void favoritedVideos(ids).then((on) => setFavorited((prev) => new Set([...prev, ...on])));
  }, [owner, items, setFavorited]);

  // Same for the posts this viewer liked.
  useEffect(() => {
    if (!owner) return;
    if (checkedLikes.current.owner !== owner) checkedLikes.current = { owner, ids: new Set() };
    const ids = items.filter(isPost).map((p) => p.id).filter((id) => !checkedLikes.current.ids.has(id));
    if (!ids.length) return;
    ids.forEach((id) => checkedLikes.current.ids.add(id));
    void likedPosts(ids).then((on) =>
      setLikeState((s) => ({ owner, ids: new Set([...(s.owner === owner ? s.ids : []), ...on]) })),
    );
  }, [owner, items]);

  // And the shops and people this viewer follows.
  useEffect(() => {
    if (!owner) return;
    if (checkedFollows.current.owner !== owner) checkedFollows.current = { owner, ids: new Set() };
    const seen = checkedFollows.current.ids;
    const shopIds = [...new Set(items.filter((i) => !isPost(i)).map((i) => (i as FeedItem).shop.id))].filter((id) => !seen.has(id));
    const people = [...new Set(items.filter(isPost).map((p) => p.author.id))].filter((id) => id !== owner && !seen.has(id));
    if (!shopIds.length && !people.length) return;
    [...shopIds, ...people].forEach((id) => seen.add(id));
    void Promise.all([followedShops(shopIds), followedProfiles(people)]).then(([s, p]) =>
      setFollowState((f) => {
        const mine = f.owner === owner;
        return { owner, shops: new Set([...(mine ? f.shops : []), ...s]), people: new Set([...(mine ? f.people : []), ...p]) };
      }),
    );
  }, [owner, items]);

  async function toggleFollow(kind: "shops" | "people", id: string) {
    if (!customer) return loginNext();
    const on = !follows[kind].has(id);
    const apply = (value: boolean) =>
      setFollowState((f) => {
        const mine = f.owner === owner;
        const next: Follows = { owner, shops: new Set(mine ? f.shops : []), people: new Set(mine ? f.people : []) };
        if (value) next[kind].add(id);
        else next[kind].delete(id);
        return next;
      });
    apply(on);
    const res = kind === "shops" ? await setFollow(id, on) : await setProfileFollow(id, on);
    if (!res.ok) {
      apply(!on);
      if (res.error === "UNAUTHENTICATED") loginNext();
    }
  }

  const onPostViewed = useCallback(
    (p: FeedPostItem) => {
      let seen: string[] = [];
      try {
        seen = JSON.parse(sessionStorage.getItem(VIEWED_KEY) ?? "[]") as string[];
      } catch {
        // storage unavailable: still count
      }
      if (seen.includes(p.id)) return;
      try {
        sessionStorage.setItem(VIEWED_KEY, JSON.stringify([...seen, p.id].slice(-500)));
      } catch {
        // ignore
      }
      bumpPost(p, (s) => ({ views: s.views + 1 }));
      void recordPostView(p.id).then((views) => views !== null && bumpPost(p, () => ({ views })));
    },
    [bumpPost],
  );

  async function toggleLike(p: FeedPostItem) {
    if (!customer) return loginNext();
    const on = !liked.has(p.id);
    const apply = (value: boolean) =>
      setLikeState((s) => {
        const ids = new Set(s.owner === owner ? s.ids : []);
        if (value) ids.add(p.id);
        else ids.delete(p.id);
        return { owner, ids };
      });
    apply(on);
    bumpPost(p, (s) => ({ likes: Math.max(0, s.likes + (on ? 1 : -1)) }));
    const res = await setPostLike(p.id, on);
    if (res.ok) bumpPost(p, () => ({ likes: res.likes }));
    else {
      apply(!on);
      bumpPost(p, (s) => ({ likes: Math.max(0, s.likes + (on ? -1 : 1)) }));
      if (res.error === "UNAUTHENTICATED") loginNext();
    }
  }

  async function removePost(p: FeedPostItem) {
    if (!window.confirm(dict.deletePostConfirm)) return;
    const res = await deletePost(p.id);
    if (res.ok) setItems((all) => all.filter((i) => i.id !== p.id));
  }

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

  // Sound was refused: the first tap, key or swipe anywhere turns it on for the playing video.
  useEffect(() => {
    if (!muted) return;
    const unlock = () => {
      const v = scroller.current?.querySelector<HTMLVideoElement>(`[data-index="${activeRef.current}"] video`);
      // Set right away (still inside the tap), so browsers that need a gesture allow it. The
      // time stamp keeps the click that follows this tap from pausing the video.
      if (v) {
        v.muted = false;
        v.dataset.soundOnAt = String(Date.now());
      }
      setMuted(false);
    };
    const events = ["pointerup", "touchend", "keydown"] as const;
    events.forEach((e) => document.addEventListener(e, unlock, { capture: true, once: true }));
    return () => events.forEach((e) => document.removeEventListener(e, unlock, { capture: true }));
  }, [muted]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

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
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link
            href={customer ? `/${locale}/feed/new` : `/${locale}/login?next=${encodeURIComponent(`/${locale}/feed/new`)}`}
            className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            <Plus className="size-4" />
            {dict.newPost}
          </Link>
          <Link href={`/${locale}`} className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold transition hover:bg-muted">
            {dict.backHome}
          </Link>
        </div>
      </div>
    );
  }

  const shareUrl =
    sheet && typeof window !== "undefined"
      ? isPost(sheet.item)
        ? `${window.location.origin}/${locale}/feed?post=${sheet.item.id}`
        : `${window.location.origin}${productPath(locale, sheet.item.shop.slug, sheet.item.slug)}`
      : "";

  return (
    <>
      <div
        ref={scroller}
        className={`${FEED_HEIGHT} no-scrollbar snap-y snap-mandatory overflow-y-auto overscroll-contain bg-black`}
      >
        <h1 className="sr-only">{dict.title}</h1>
        {items.map((item, i) =>
          isPost(item) ? (
            <PostSlide
              key={item.id}
              index={i}
              post={item}
              locale={locale}
              dict={dict}
              active={i === active}
              preload={i === active + 1}
              muted={muted}
              onSoundBlocked={() => setMuted(true)}
              stats={postStatsOf(item)}
              liked={liked.has(item.id)}
              mine={item.author.id === owner}
              following={follows.people.has(item.author.id)}
              onFollow={() => void toggleFollow("people", item.author.id)}
              onViewed={() => onPostViewed(item)}
              onLike={() => void toggleLike(item)}
              onComments={() => setSheet({ kind: "comments", item })}
              onShare={() => setSheet({ kind: "share", item })}
              onDelete={() => void removePost(item)}
            />
          ) : (
          <FeedSlide
            key={item.id}
            index={i}
            item={item}
            locale={locale}
            dict={dict}
            active={i === active}
            preload={i === active + 1}
            muted={muted}
            onSoundBlocked={() => setMuted(true)}
            stats={statsOf(item)}
            favorited={favorited.has(item.id)}
            // No "+" on the viewer's own shop.
            following={follows.shops.has(item.shop.id) || customer?.shop?.id === item.shop.id}
            onFollow={() => void toggleFollow("shops", item.shop.id)}
            onViewed={() => onViewed(item)}
            onFavorite={() => void toggleFavorite(item)}
            onOpen={(kind) => setSheet({ kind, item })}
          />
          ),
        )}
        {loadFailed && (
          <p role="alert" className="py-6 text-center text-sm text-white/70">
            {dict.loadError}
          </p>
        )}
      </div>

      {/* Post your own video (no product needed). */}
      <NewPostButton locale={locale} label={dict.newPost} signedIn={!!customer} />

      {/* Each sheet mounts when it opens, so it starts fresh and loads live data. */}
      {sheet?.kind === "comments" && (
        <CommentsSheet
          key={sheet.item.id}
          open
          onClose={() => setSheet(null)}
          target={{ kind: isPost(sheet.item) ? "post" : "product", id: sheet.item.id }}
          total={isPost(sheet.item) ? postStatsOf(sheet.item).comments : statsOf(sheet.item).comments}
          locale={locale}
          dict={dict}
          focus={sheet.focus}
          onCountChange={(d) => {
            const item = sheet.item;
            if (isPost(item)) bumpPost(item, (s) => ({ comments: Math.max(0, s.comments + d) }));
            else bump(item, (s) => ({ comments: Math.max(0, s.comments + d) }));
          }}
        />
      )}
      {sheet?.kind === "share" && (
        <ShareSheet
          key={sheet.item.id}
          open
          onClose={() => setSheet(null)}
          url={shareUrl}
          title={isPost(sheet.item) ? sheet.item.caption || sheet.item.author.name : sheet.item.name}
          dict={dict}
          onShared={() => {
            const item = sheet.item;
            if (isPost(item)) {
              bumpPost(item, (s) => ({ shares: s.shares + 1 }));
              void recordPostShare(item.id).then((shares) => shares !== null && bumpPost(item, () => ({ shares })));
              return;
            }
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
  onSoundBlocked,
  stats,
  favorited,
  following,
  onFollow,
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
  onSoundBlocked: () => void;
  stats: VideoStats;
  favorited: boolean;
  following: boolean;
  onFollow: () => void;
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
    if (active) startPlaying(v, muted, onSoundBlocked);
    else v.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the slide comes on screen
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
    // The tap that just turned sound on (the browser had refused it) doesn't also pause.
    if (Date.now() - Number(v.dataset.soundOnAt ?? 0) < 600) return;
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


        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-3 bg-linear-to-t from-black/85 via-black/40 to-transparent px-4 pb-4 pt-20 text-white">
          <div className="flex items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Link href={`/${locale}/s/${item.shop.slug}`} className="pointer-events-auto block truncate text-[15px] font-bold">
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
              <RailAvatar
                href={`/${locale}/s/${item.shop.slug}`}
                name={item.shop.name}
                following={following}
                dict={dict}
                onFollow={onFollow}
              >
                {item.shop.logoUrl ? (
                  <ProductImage src={item.shop.logoUrl} alt="" sizes="48px" className="object-cover" />
                ) : (
                  <Store className="size-6" />
                )}
              </RailAvatar>
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

/**
 * Plays with sound. Browsers may refuse sound before the visitor has tapped anything: then it
 * plays muted and `onBlocked` lets the feed turn sound on at the first tap.
 */
function startPlaying(v: HTMLVideoElement, muted: boolean, onBlocked: () => void) {
  v.muted = muted;
  v.play().catch(() => {
    // Refused even muted (e.g. low-power mode): the play button stays up.
    if (v.muted) return;
    v.muted = true;
    onBlocked();
    v.play().catch(() => {});
  });
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

/**
 * TikTok-style profile picture at the top of the rail: opens the shop or profile, with a red
 * "+" to follow. Once followed the "+" turns into a tick for a moment and goes away (unfollow
 * from the shop or profile page).
 */
function RailAvatar({
  href,
  name,
  following,
  dict,
  onFollow,
  children,
}: {
  href: string;
  name: string;
  following: boolean;
  dict: Dict;
  onFollow: () => void;
  children: React.ReactNode;
}) {
  const [justFollowed, setJustFollowed] = useState(false);
  useEffect(() => {
    if (!justFollowed) return;
    const t = setTimeout(() => setJustFollowed(false), 900);
    return () => clearTimeout(t);
  }, [justFollowed]);

  return (
    <div className="relative mb-2">
      <Link
        href={href}
        aria-label={name}
        className="relative flex size-12 items-center justify-center overflow-hidden rounded-full bg-white text-primary ring-2 ring-white"
      >
        {children}
      </Link>
      {(!following || justFollowed) && (
        <button
          type="button"
          onClick={() => {
            if (following) return;
            setJustFollowed(true);
            onFollow();
          }}
          aria-label={interpolate(dict.follow, { name })}
          className={`absolute -bottom-2.5 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full shadow transition-all duration-300 active:scale-90 ${
            justFollowed ? "scale-110 bg-white text-[#ff3b5c]" : "bg-[#ff3b5c] text-white"
          }`}
        >
          {justFollowed ? <Check className="size-4" strokeWidth={3} /> : <Plus className="size-4" strokeWidth={3} />}
        </button>
      )}
    </div>
  );
}

/** Floating "+" over the feed: opens the new post page (sign in first). */
function NewPostButton({ locale, label, signedIn }: { locale: Locale; label: string; signedIn: boolean }) {
  const href = `/${locale}/feed/new`;
  return (
    <Link
      href={signedIn ? href : `/${locale}/login?next=${encodeURIComponent(href)}`}
      aria-label={label}
      title={label}
      className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 flex h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-lg transition hover:brightness-110 md:right-[max(0.75rem,calc(50%-14rem))] md:top-[calc(var(--header-h,4rem)+0.75rem)]"
    >
      <Plus className="size-4" />
      <span>{label}</span>
    </Link>
  );
}

/** A customer's own video: author, caption, likes and shares, no product card. */
function PostSlide({
  index,
  post,
  locale,
  dict,
  active,
  preload,
  muted,
  onSoundBlocked,
  stats,
  liked,
  mine,
  following,
  onFollow,
  onViewed,
  onLike,
  onComments,
  onShare,
  onDelete,
}: {
  index: number;
  post: FeedPostItem;
  locale: Locale;
  dict: Dict;
  active: boolean;
  preload: boolean;
  muted: boolean;
  onSoundBlocked: () => void;
  stats: PostStats;
  liked: boolean;
  mine: boolean;
  following: boolean;
  onFollow: () => void;
  onViewed: () => void;
  onLike: () => void;
  onComments: () => void;
  onShare: () => void;
  onDelete: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(true);
  const [landscape, setLandscape] = useState(false);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (active) startPlaying(v, muted, onSoundBlocked);
    else v.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the slide comes on screen
  }, [active]);

  useEffect(() => {
    if (!active || paused) return;
    const t = setTimeout(onViewed, VIEW_AFTER_MS);
    return () => clearTimeout(t);
  }, [active, paused, onViewed]);

  function togglePlay() {
    const v = video.current;
    if (!v) return;
    // The tap that just turned sound on (the browser had refused it) doesn't also pause.
    if (Date.now() - Number(v.dataset.soundOnAt ?? 0) < 600) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  const initials = post.author.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <section data-index={index} aria-label={post.caption || post.author.name} className="relative h-full snap-start snap-always">
      <div className="relative mx-auto h-full max-w-md overflow-hidden">
        <video
          ref={video}
          src={post.videoUrl}
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


        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 bg-linear-to-t from-black/85 via-black/40 to-transparent px-4 pb-5 pt-24 text-white">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Link href={`/${locale}/u/${post.author.id}`} className="pointer-events-auto block truncate text-[15px] font-bold">
              {post.author.name}
            </Link>
            {post.caption && <p className="line-clamp-3 whitespace-pre-line text-sm text-white/90">{post.caption}</p>}
            <p className="flex items-center gap-1.5 text-xs text-white/75">
              <Eye className="size-3.5" />
              {interpolate(dict.views, { n: formatCount(stats.views, locale) })}
            </p>
          </div>

          <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-4 pb-1">
            <RailAvatar href={`/${locale}/u/${post.author.id}`} name={post.author.name} following={following || mine} dict={dict} onFollow={onFollow}>
              {post.author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- social profile picture
                <img src={post.author.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
              ) : (
                <span className="text-sm font-bold">{initials}</span>
              )}
            </RailAvatar>
            <RailButton label={liked ? dict.unlike : dict.like} pressed={liked} count={formatCount(stats.likes, locale)} onClick={onLike}>
              <Heart className={`size-7 ${liked ? "fill-[#ff3b5c] text-[#ff3b5c]" : ""}`} />
            </RailButton>
            <RailButton label={dict.comments} count={formatCount(stats.comments, locale)} onClick={onComments}>
              <MessageCircle className="size-7" />
            </RailButton>
            <RailButton label={dict.share} count={formatCount(stats.shares, locale)} onClick={onShare}>
              <Share2 className="size-7" />
            </RailButton>
            {mine && (
              <button
                type="button"
                onClick={onDelete}
                aria-label={dict.deletePost}
                title={dict.deletePost}
                className="flex size-11 items-center justify-center rounded-full bg-black/25 text-white backdrop-blur-sm active:scale-95"
              >
                <Trash2 className="size-5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

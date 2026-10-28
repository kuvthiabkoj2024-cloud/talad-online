"use client";

import type { Locale } from "@talad/shared";
import { Clapperboard, Heart, LoaderCircle, MessageCircle, Play, Share2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ProfileVideoPage } from "@/lib/api";
import { formatCount } from "@/lib/format";
import { loadProfileVideos } from "@/lib/profile-actions";

type Dict = Dictionary["profile"];

/**
 * The customer's videos as an edge-to-edge grid (first frame as the cover; views, likes,
 * comments and shares over it). A tile opens the video in the feed.
 */
export function ProfileVideos({
  customerId,
  initial,
  locale,
  dict,
}: {
  customerId: string;
  initial: ProfileVideoPage;
  locale: Locale;
  dict: Dict;
}) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  function more() {
    if (!cursor) return;
    setFailed(false);
    startLoading(async () => {
      const page = await loadProfileVideos(customerId, cursor);
      if (!page) return setFailed(true);
      setItems((list) => [...list, ...page.items.filter((p) => !list.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span className="mb-1 flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Clapperboard className="size-8" strokeWidth={1.75} />
        </span>
        <p className="font-semibold">{dict.noVideos}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-3 gap-0.5">
        {items.map((p) => (
          <li key={p.id}>
            <Link href={`/${locale}/feed?post=${p.id}`} aria-label={p.caption || dict.videos} className="group relative block aspect-[3/4] overflow-hidden bg-neutral-900">
              {/* The first frame stands in for a cover (posts have none). */}
              <video
                src={`${p.videoUrl}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-10 text-white">
                <span className="flex items-center gap-1 text-xs font-bold drop-shadow">
                  <Play className="size-3.5 fill-current" />
                  {formatCount(p.stats.views, locale)}
                </span>
                <span className="flex items-center gap-2 text-[10px] font-semibold text-white/85 tabular-nums">
                  <Stat icon={Heart} label={dict.likes} value={formatCount(p.stats.likes, locale)} />
                  <Stat icon={MessageCircle} label={dict.comments} value={formatCount(p.stats.comments, locale)} />
                  <Stat icon={Share2} label={dict.shares} value={formatCount(p.stats.shares, locale)} />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {failed && (
        <p role="alert" className="text-center text-sm text-sale">
          {dict.loadFailed}
        </p>
      )}
      {cursor && (
        <button
          type="button"
          onClick={more}
          disabled={loading}
          className="mx-auto mb-2 flex items-center gap-2 rounded-full bg-muted px-5 py-2 text-sm font-semibold transition hover:bg-muted/70"
        >
          {loading && <LoaderCircle className="size-4 animate-spin" />}
          {dict.loadMore}
        </button>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Heart; label: string; value: string }) {
  return (
    <span className="flex items-center gap-0.5" title={label}>
      <Icon className="size-3" aria-hidden />
      <span className="sr-only">{label}</span>
      {value}
    </span>
  );
}

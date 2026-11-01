"use client";

import type { Locale } from "@talad/shared";
import { Heart, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { LikedVideoPage } from "@/lib/api";
import { loadLikedVideos } from "@/lib/profile-actions";
import { VideoTile } from "./video-tile";

/** The videos the customer liked, most recent first: customers' posts and shops' product videos. */
export function ProfileLiked({ customerId, initial, locale, dict }: { customerId: string; initial: LikedVideoPage; locale: Locale; dict: Dictionary["profile"] }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  function more() {
    if (!cursor) return;
    setFailed(false);
    startLoading(async () => {
      const page = await loadLikedVideos(cursor);
      if (!page) return setFailed(true);
      setItems((list) => [...list, ...page.items.filter((v) => !list.some((x) => x.id === v.id))]);
      setCursor(page.nextCursor);
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span className="mb-1 flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Heart className="size-8" strokeWidth={1.75} />
        </span>
        <p className="font-semibold">{dict.noLiked}</p>
        <p className="text-sm text-muted-foreground">{dict.noLikedHint}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="px-4 pt-3 text-xs text-muted-foreground">{dict.likedPrivate}</p>
      <ul className="grid grid-cols-3 gap-0.5">
        {items.map((v) => (
          <li key={`${v.kind}-${v.id}`}>
            <VideoTile
              href={`/${locale}/feed?${v.kind === "post" ? "post" : "video"}=${v.id}&back=${customerId}&tab=liked`}
              label={v.title || dict.liked}
              videoUrl={v.videoUrl}
              posterUrl={v.posterUrl}
              stats={v.stats}
              locale={locale}
              dict={dict}
            />
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
          className="mx-auto mb-2 flex items-center gap-2 rounded-full bg-muted px-5 py-2 text-sm font-semibold transition hover:bg-muted/70 disabled:opacity-60"
        >
          {loading && <LoaderCircle className="size-4 animate-spin" />}
          {dict.loadMore}
        </button>
      )}
    </div>
  );
}

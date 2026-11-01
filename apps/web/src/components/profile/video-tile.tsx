import type { Locale } from "@talad/shared";
import { Heart, MessageCircle, Play, Share2 } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { formatCount } from "@/lib/format";

/** A video in a profile's grid: its cover or first frame, with the numbers over it. Opens in the feed. */
export function VideoTile({
  href,
  label,
  videoUrl,
  posterUrl,
  stats,
  locale,
  dict,
}: {
  href: string;
  label: string;
  videoUrl: string;
  posterUrl?: string | null;
  stats: { views: number; likes: number; comments: number; shares: number };
  locale: Locale;
  dict: Dictionary["profile"];
}) {
  return (
    <Link href={href} aria-label={label} className="group relative block aspect-[3/4] overflow-hidden bg-black">
      {/* The first frame stands in for a cover where there is none. */}
      <video src={`${videoUrl}#t=0.1`} poster={posterUrl ?? undefined} muted playsInline preload="metadata" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-linear-to-t from-black/80 via-black/40 to-transparent px-2 pb-1.5 pt-6 text-white">
        <span className="flex items-center gap-1 text-xs font-bold drop-shadow">
          <Play className="size-3.5 fill-current" />
          {formatCount(stats.views, locale)}
        </span>
        <span className="flex items-center gap-2 text-[10px] font-semibold text-white/85 tabular-nums">
          <Stat icon={Heart} label={dict.likes} value={formatCount(stats.likes, locale)} />
          <Stat icon={MessageCircle} label={dict.comments} value={formatCount(stats.comments, locale)} />
          <Stat icon={Share2} label={dict.shares} value={formatCount(stats.shares, locale)} />
        </span>
      </span>
    </Link>
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

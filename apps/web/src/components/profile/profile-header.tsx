"use client";

import type { Locale } from "@talad/shared";
import { ArrowLeft, CalendarDays, Check, LoaderCircle, Plus, Share2, Video } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { CustomerProfile } from "@/lib/api";
import { followedProfiles, setProfileFollow } from "@/lib/follow-actions";
import { formatCount, interpolate } from "@/lib/format";
import { useSession } from "../auth/session-provider";
import { ShareSheet, type ShareSheetDict } from "../feed/share-sheet";

type Dict = Dictionary["profile"];
const DATE_LOCALES = { lo: "lo-LA", en: "en-GB" } as const;

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase() || "?";

/**
 * Profile top: a green cover, the picture over it, name and join date, the numbers in one row
 * (following · followers · likes) and Follow + Share — or "Post a video" on the viewer's own.
 */
export function ProfileHeader({
  profile,
  locale,
  dict,
  shareDict,
  backLabel,
}: {
  profile: CustomerProfile;
  locale: Locale;
  dict: Dict;
  shareDict: ShareSheetDict;
  backLabel: string;
}) {
  const { customer } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const mine = customer?.id === profile.id;
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(profile.followers);
  const [sharing, setSharing] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!customer || mine) return;
    let live = true;
    void followedProfiles([profile.id]).then((ids) => live && setFollowing(ids.includes(profile.id)));
    return () => {
      live = false;
    };
  }, [customer, mine, profile.id]);

  // Back: to the account page from one's own profile, else wherever the viewer came from.
  function back() {
    if (mine) router.push(`/${locale}/account`);
    else if (window.history.length > 1) router.back();
    else router.push(`/${locale}/feed`);
  }

  const login = () => router.push(`/${locale}/login?next=${encodeURIComponent(pathname)}`);

  function toggle() {
    if (!customer) return login();
    const next = !following;
    setFollowing(next);
    setFollowers((n) => Math.max(0, n + (next ? 1 : -1)));
    startTransition(async () => {
      const res = await setProfileFollow(profile.id, next);
      if (res.ok) {
        setFollowing(res.following);
        setFollowers(res.followers);
      } else {
        setFollowing(!next);
        setFollowers((n) => Math.max(0, n + (next ? -1 : 1)));
        if (res.error === "UNAUTHENTICATED") login();
      }
    });
  }

  const joined = new Intl.DateTimeFormat(DATE_LOCALES[locale], { month: "long", year: "numeric" }).format(new Date(profile.joinedAt));
  const stats = [
    { label: dict.following, value: profile.following },
    { label: dict.followers, value: followers },
    { label: dict.likes, value: profile.likes },
  ];
  const action = "flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold transition active:scale-[0.98]";

  return (
    <section className="relative overflow-hidden bg-card sm:rounded-3xl sm:shadow-sm sm:ring-1 sm:ring-border">
      {/* Cover: brand gradient with soft light and a dot pattern (under the phone's status bar too). */}
      <div aria-hidden className="relative h-[calc(7rem+env(safe-area-inset-top))] overflow-hidden bg-linear-to-br from-[#43a047] via-primary to-[#1b5e20] sm:h-36">
        <div className="absolute -left-10 -top-16 size-48 rounded-full bg-white/15 blur-2xl" />
        <div className="absolute -bottom-20 right-0 size-56 rounded-full bg-[#a5d6a7]/25 blur-3xl" />
        <div className="absolute inset-0 opacity-20 [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:16px_16px]" />
      </div>
      <button
        type="button"
        onClick={back}
        aria-label={backLabel}
        title={backLabel}
        className="absolute left-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex size-10 items-center justify-center rounded-full bg-black/20 text-white backdrop-blur-sm transition hover:bg-black/30 active:scale-95"
      >
        <ArrowLeft className="size-5" />
      </button>

      <div className="relative flex flex-col items-center px-5 pb-6 text-center">
        <span className="-mt-14 flex size-28 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-3xl font-bold text-primary shadow-xl ring-4 ring-card">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- social profile picture
            <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            initialsOf(profile.name)
          )}
        </span>

        <h1 className="mt-3 max-w-full truncate text-xl font-bold sm:text-2xl">{profile.name}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          {interpolate(dict.joined, { date: joined })}
        </p>

        <dl className="mt-5 flex items-stretch justify-center">
          {stats.map((s, i) => (
            <div key={s.label} className={`flex min-w-24 flex-col-reverse items-center gap-0.5 px-4 ${i > 0 ? "border-l border-border" : ""}`}>
              <dt className="text-xs text-muted-foreground">{s.label}</dt>
              <dd className="text-lg font-bold leading-tight tabular-nums">{formatCount(s.value, locale)}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex w-full max-w-xs gap-2">
          {mine ? (
            <Link href={`/${locale}/feed/new`} className={`${action} flex-1 bg-primary text-primary-foreground hover:brightness-110`}>
              <Video className="size-4" />
              {dict.postVideo}
            </Link>
          ) : (
            <button
              type="button"
              onClick={toggle}
              disabled={pending}
              aria-pressed={following}
              className={`${action} flex-1 ${following ? "bg-muted text-foreground hover:bg-muted/70" : "bg-[#ff3b5c] text-white shadow-md shadow-[#ff3b5c]/25 hover:brightness-110"}`}
            >
              {pending ? <LoaderCircle className="size-4 animate-spin" /> : following ? <Check className="size-4" /> : <Plus className="size-4" />}
              {following ? dict.followingButton : dict.follow}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSharing(true)}
            aria-label={dict.shareProfile}
            title={dict.shareProfile}
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition hover:bg-muted/70 active:scale-95"
          >
            <Share2 className="size-4" />
          </button>
        </div>
      </div>

      {sharing && (
        <ShareSheet
          open
          onClose={() => setSharing(false)}
          url={`${window.location.origin}/${locale}/u/${profile.id}`}
          title={profile.name}
          dict={{ ...shareDict, shareTitle: dict.shareTitle }}
        />
      )}
    </section>
  );
}

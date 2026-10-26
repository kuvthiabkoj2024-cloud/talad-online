"use client";

import { Check, LoaderCircle, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Locale } from "@talad/shared";
import { followState, setFollow } from "@/lib/follow-actions";
import { formatCount, interpolate } from "@/lib/format";
import { useSession } from "../auth/session-provider";

/** Sent when a follow changes, so every follower count of that shop on the page updates. */
const EVENT = "talad:shop-follow";
type FollowEvent = CustomEvent<{ shopId: string; followers: number }>;

/**
 * Follow / Following toggle for a shop. Guests are sent to sign in and come back; owners
 * don't see it on their own shop.
 */
export function FollowButton({
  shopId,
  labels,
  size = "md",
  initialFollowing = false,
}: {
  shopId: string;
  /** Already known to be followed (e.g. on the "shops I follow" list). */
  initialFollowing?: boolean;
  labels: { follow: string; following: string };
  /** "md": header button; "sm": compact (product page shop card). */
  size?: "md" | "sm";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { customer } = useSession();
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, startTransition] = useTransition();
  const ownShop = customer?.shop?.id === shopId;

  useEffect(() => {
    if (!customer || ownShop) return;
    let live = true;
    void followState(shopId).then((s) => live && s && setFollowing(s.following));
    return () => {
      live = false;
    };
  }, [customer, ownShop, shopId]);

  if (ownShop) return null;

  function toggle() {
    if (!customer) {
      router.push(`${pathname.split("/").slice(0, 2).join("/")}/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    const next = !following;
    setFollowing(next);
    startTransition(async () => {
      const res = await setFollow(shopId, next);
      if (!res.ok) {
        setFollowing(!next);
        if (res.error === "UNAUTHENTICATED") router.push(`${pathname.split("/").slice(0, 2).join("/")}/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setFollowing(res.following);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { shopId, followers: res.followers } }));
    });
  }

  const base =
    size === "sm"
      ? "flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-colors sm:px-5 sm:py-2.5"
      : "flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors sm:px-5";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={following}
      disabled={pending}
      className={`${base} ${
        following
          ? "border border-border bg-muted text-foreground hover:bg-muted/70"
          : "border border-primary bg-primary text-primary-foreground hover:brightness-110"
      }`}
    >
      {pending ? <LoaderCircle className="size-4 shrink-0 animate-spin" /> : following ? <Check className="size-4 shrink-0" /> : <Plus className="size-4 shrink-0" />}
      {following ? labels.following : labels.follow}
    </button>
  );
}

/** A shop's follower count ("1.2 ພັນ ຜູ້ຕິດຕາມ") that updates live when the visitor follows. */
export function FollowerCount({ shopId, initial, label, locale }: { shopId: string; initial: number; label: string; locale: Locale }) {
  const [n, setN] = useState(initial);
  useEffect(() => {
    const onChange = (e: Event) => {
      const { detail } = e as FollowEvent;
      if (detail.shopId === shopId) setN(detail.followers);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [shopId]);
  return <>{interpolate(label, { n: formatCount(n, locale) })}</>;
}

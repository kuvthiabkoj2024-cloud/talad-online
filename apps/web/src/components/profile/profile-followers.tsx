"use client";

import type { Locale } from "@talad/shared";
import { ChevronRight, LoaderCircle, Users } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ProfileFollowerPage } from "@/lib/api";
import { loadProfileFollowers } from "@/lib/profile-actions";
import { initialsOf } from "./profile-header";

type Dict = Dictionary["profile"];

/** Who follows the customer, newest first; each leads to that person's profile. */
export function ProfileFollowers({
  customerId,
  initial,
  locale,
  dict,
}: {
  customerId: string;
  initial: ProfileFollowerPage;
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
      const page = await loadProfileFollowers(customerId, cursor);
      if (!page) return setFailed(true);
      setItems((list) => [...list, ...page.items.filter((p) => !list.some((x) => x.id === p.id))]);
      setCursor(page.nextCursor);
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span className="mb-1 flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Users className="size-8" strokeWidth={1.75} />
        </span>
        <p className="font-semibold">{dict.noFollowers}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-2">
      <ul className="divide-y divide-border">
        {items.map((f) => (
          <li key={f.id}>
            <Link href={`/${locale}/u/${f.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60">
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-sm font-bold text-primary ring-2 ring-primary-soft">
                {f.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- social profile picture
                  <img src={f.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
                ) : (
                  initialsOf(f.name)
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{f.name}</span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
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
          className="mx-auto flex items-center gap-2 rounded-full bg-muted px-5 py-2 text-sm font-semibold transition hover:bg-muted/70"
        >
          {loading && <LoaderCircle className="size-4 animate-spin" />}
          {dict.loadMore}
        </button>
      )}
    </div>
  );
}

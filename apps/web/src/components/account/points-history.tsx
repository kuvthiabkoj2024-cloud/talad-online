"use client";

import type { Locale } from "@talad/shared";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { interpolate } from "@/lib/format";
import { formatDate, type PointsView } from "@/lib/orders";
import { loadMorePoints } from "@/lib/points-actions";

type Dict = Dictionary["account"];

/** Points earned, spent, returned or expired, newest first, with "Show more". */
export function PointsHistory({ initial, locale, dict }: { initial: PointsView; locale: Locale; dict: Dict }) {
  const [items, setItems] = useState(initial.items);
  const [cursor, setCursor] = useState(initial.nextCursor);
  const [loading, startLoading] = useTransition();

  function more() {
    if (!cursor) return;
    startLoading(async () => {
      const page = await loadMorePoints(cursor);
      if (!page) return;
      setItems((list) => [...list, ...page.items.filter((i) => !list.some((x) => x.id === i.id))]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <section className="rounded-2xl bg-card shadow-sm ring-1 ring-border">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{dict.pointsHistory}</h2>
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{dict.pointsEmpty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{dict.pointsTypes[i.type]}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(i.createdAt, locale, true)}
                  {i.orderNumber && (
                    <>
                      {" · "}
                      <Link href={`/${locale}/account/orders/${i.orderNumber}`} className="hover:underline">
                        {interpolate(dict.pointsOrder, { n: i.orderNumber })}
                      </Link>
                    </>
                  )}
                </p>
                {i.type === "EARN" && i.expiresAt && (
                  <p className="text-xs text-muted-foreground">{interpolate(dict.pointsExpires, { date: formatDate(i.expiresAt, locale) })}</p>
                )}
              </div>
              <span className={`shrink-0 text-base font-bold tabular-nums ${i.points >= 0 ? "text-primary" : "text-sale"}`}>
                {i.points >= 0 ? "+" : ""}
                {i.points.toLocaleString("en-US")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <button
          type="button"
          onClick={more}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 border-t border-border py-3 text-sm font-semibold text-primary hover:bg-muted"
        >
          {loading && <LoaderCircle className="size-4 animate-spin" />}
          {dict.pointsMore}
        </button>
      )}
    </section>
  );
}

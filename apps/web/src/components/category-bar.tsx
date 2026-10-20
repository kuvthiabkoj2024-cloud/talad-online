"use client";

import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { categoryIcon } from "@/lib/category-icons";

export interface CategoryItem {
  slug: string;
  name: string;
  iconUrl: string | null;
}

export function CategoryBar({
  locale,
  categories,
  labels,
}: {
  locale: string;
  categories: CategoryItem[];
  labels: { title: string; all: string; prev: string; next: string };
}) {
  const scroller = useRef<HTMLUListElement>(null);

  function scroll(direction: 1 | -1) {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  const items = [
    { slug: "", name: labels.all, iconUrl: null, icon: Star, active: true },
    ...categories.map((c) => ({ ...c, icon: categoryIcon(c.slug), active: false })),
  ];

  return (
    <nav aria-label={labels.title}className="relative rounded-2xl bg-card px-2 py-2 shadow-sm ring-1 ring-border sm:px-12">
      <ArrowButton side="left" label={labels.prev} onClick={() => scroll(-1)} />
      <ul ref={scroller} className="no-scrollbar flex snap-x overflow-x-auto">
        {items.map(({ slug, name, iconUrl, icon: Icon, active }) => (
          <li key={slug || "all"} className="shrink-0 snap-start border-r border-border last:border-r-0">
            <Link
              href={slug ? `/${locale}/c/${slug}` : `/${locale}/c`}
              className={`flex items-center gap-3 whitespace-nowrap rounded-xl px-5 py-3 text-base transition-colors hover:bg-muted ${
                active ? "text-primary" : ""
              }`}
            >
              {iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote CDN host not configured yet
                <img src={iconUrl} alt="" className="size-8" />
              ) : (
                <span className="flex size-9 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Icon className="size-5" />
                </span>
              )}
              {name}
            </Link>
          </li>
        ))}
      </ul>
      <ArrowButton side="right" label={labels.next} onClick={() => scroll(1)} />
    </nav>
  );
}

function ArrowButton({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground sm:flex ${
        side === "left" ? "left-2" : "right-2"
      }`}
    >
      <Icon className="size-5" />
    </button>
  );
}

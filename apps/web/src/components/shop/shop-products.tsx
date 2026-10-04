"use client";

import type { Locale } from "@talad/shared";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  Flame,
  LoaderCircle,
  Search,
  SearchX,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ProductCard as Product } from "@/lib/api";
import { interpolate } from "@/lib/format";
import { loadShopProducts } from "@/lib/shop-actions";
import type { ShopProductPage, ShopSort } from "@/lib/shop";
import { BottomSheet } from "../bottom-sheet";
import { ProductCard } from "../product-card";

/** Wait this long after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 400;

const SORTS: { key: ShopSort; icon: typeof Flame; label: keyof Dictionary["shop"]; pricePrefix?: true }[] = [
  { key: "popular", icon: Flame, label: "sortPopular" },
  { key: "new", icon: Sparkles, label: "sortNew" },
  { key: "price_asc", icon: ArrowUpNarrowWide, label: "sortPriceAsc", pricePrefix: true },
  { key: "price_desc", icon: ArrowDownWideNarrow, label: "sortPriceDesc", pricePrefix: true },
];

/**
 * In-shop search (as you type), sort and "Load more". Search and sort live in the URL
 * (shareable, server-rendered). The search box stays mounted across searches so it keeps
 * focus; only the result list resets.
 */
export function ShopProducts({
  slug,
  locale,
  q,
  sort,
  initial,
  dict,
  soldLabel,
  closeLabel,
}: {
  slug: string;
  locale: Locale;
  q: string;
  sort: ShopSort;
  initial: ShopProductPage;
  dict: Dictionary["shop"];
  soldLabel: string;
  closeLabel: string;
}) {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const pathname = usePathname();
  const [query, setQuery] = useState(q);
  const [navigating, startNavigating] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  // The search we asked for last; any other change to `q` came from outside (Back button, a link),
  // so the box follows the URL then — but never overwrites what the customer is typing.
  const [requested, setRequested] = useState(q);
  const [appliedQ, setAppliedQ] = useState(q);
  if (q !== appliedQ) {
    setAppliedQ(q);
    if (q !== requested) {
      setRequested(q);
      setQuery(q);
    }
  }

  const href = (next: { q?: string; sort?: ShopSort }) => {
    const params = new URLSearchParams();
    const nq = next.q ?? q;
    const ns = next.sort ?? sort;
    if (nq) params.set("q", nq);
    if (ns !== "popular") params.set("sort", ns);
    const s = params.toString();
    return s ? `${pathname}?${s}` : pathname;
  };

  const search = (term: string) => {
    setRequested(term);
    startNavigating(() => router.replace(href({ q: term }), { scroll: false }));
  };

  // Search as you type, once typing pauses.
  useEffect(() => {
    const term = query.trim();
    if (term === q) return;
    const timer = setTimeout(() => search(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the typed text or applied query changes
  }, [query, q]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="text-lg font-bold sm:text-xl">
          {q ? interpolate(dict.resultsFor, { n: initial.total, q }) : dict.allProducts}
        </h2>
        <div className="flex items-center gap-2 lg:w-80">
        <form
          role="search"
          className="relative min-w-0 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            search(query.trim()); // Enter searches right away
          }}
        >
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
            {navigating ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
          </span>
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={dict.searchPlaceholder}
            aria-label={dict.searchPlaceholder}
            maxLength={100}
            // Hide the browser's own clear button — we render a single one.
            className="h-11 w-full rounded-full border border-border bg-card pl-10 pr-11 text-sm outline-none transition-colors focus:border-primary focus:ring-4 focus:ring-primary/15 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query && (
            <button
              type="button"
              aria-label={dict.clearSearch}
              onClick={() => {
                setQuery("");
                search("");
                input.current?.focus();
              }}
              className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </form>
        {/* Phones: sort options live in a bottom sheet instead of a row of chips */}
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          aria-label={dict.filter}
          className="relative flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted sm:hidden"
        >
          <SlidersHorizontal className="size-5" />
          {sort !== "popular" && (
            <span aria-hidden className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-card" />
          )}
        </button>
        </div>
      </div>

      <nav aria-label={dict.sortLabel} className="hidden flex-wrap gap-2 sm:flex">
        {SORTS.map(({ key, icon: Icon, label, pricePrefix }) => {
          const active = key === sort;
          return (
            <Link
              key={key}
              href={href({ sort: key })}
              replace
              scroll={false}
              aria-current={active ? "true" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card text-muted-foreground ring-1 ring-border hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {pricePrefix && dict.sortPricePrefix} {dict[label]}
            </Link>
          );
        })}
      </nav>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={dict.sortLabel} closeLabel={closeLabel}>
        <ul className="flex flex-col gap-1 pb-2">
          {SORTS.map(({ key, icon: Icon, label, pricePrefix }) => {
            const active = key === sort;
            return (
              <li key={key}>
                <Link
                  href={href({ sort: key })}
                  replace
                  scroll={false}
                  onClick={() => setSheetOpen(false)}
                  aria-current={active ? "true" : undefined}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 text-sm transition-colors ${
                    active ? "bg-primary-soft font-semibold text-primary" : "hover:bg-muted"
                  }`}
                >
                  <Icon className="size-5" />
                  <span className="flex-1">
                    {pricePrefix && dict.sortPricePrefix} {dict[label]}
                  </span>
                  {active && <Check className="size-5" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </BottomSheet>

      <ShopResults
        // A new search or sort starts a fresh list (and resets "Load more").
        key={`${q}|${sort}`}
        slug={slug}
        locale={locale}
        q={q}
        sort={sort}
        initial={initial}
        dict={dict}
        soldLabel={soldLabel}
        dimmed={navigating}
        onClearSearch={() => {
          setQuery("");
          search("");
        }}
      />
    </section>
  );
}

function ShopResults({
  slug,
  locale,
  q,
  sort,
  initial,
  dict,
  soldLabel,
  dimmed,
  onClearSearch,
}: {
  slug: string;
  locale: Locale;
  q: string;
  sort: ShopSort;
  initial: ShopProductPage;
  dict: Dictionary["shop"];
  soldLabel: string;
  dimmed: boolean;
  onClearSearch: () => void;
}) {
  const [items, setItems] = useState<Product[]>(initial.items);
  const [page, setPage] = useState(initial.page);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [loading, startLoading] = useTransition();

  function loadMore() {
    startLoading(async () => {
      const next = await loadShopProducts(slug, { q: q || undefined, sort, page: page + 1 });
      if (!next) return;
      // Skip anything already shown (e.g. a product republished between pages).
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...next.items.filter((p) => !seen.has(p.id))];
      });
      setPage(next.page);
      setHasMore(next.hasMore);
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-12 text-center shadow-sm ring-1 ring-border">
        <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <SearchX className="size-7" />
        </span>
        <p className="font-semibold">{q ? dict.noResults : dict.noProducts}</p>
        {q && (
          <>
            <p className="text-sm text-muted-foreground">{dict.noResultsBody}</p>
            <button
              type="button"
              onClick={onClearSearch}
              className="mt-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              {dict.clearSearch}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <ul
        className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6 ${
          dimmed ? "opacity-60" : ""
        }`}
      >
        {items.map((p) => (
          <li key={p.id} className="flex">
            <ProductCard product={p} locale={locale} soldLabel={soldLabel} />
          </li>
        ))}
      </ul>

      <div className="flex flex-col items-center gap-3 pt-2">
        <p className="text-sm text-muted-foreground">
          {interpolate(dict.showing, { shown: items.length, total: initial.total })}
        </p>
        {hasMore && (
          <button
            type="button"
            disabled={loading}
            onClick={loadMore}
            className="flex h-11 min-w-44 items-center justify-center gap-2 rounded-full border-2 border-primary px-6 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft disabled:opacity-60"
          >
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            {dict.loadMore}
          </button>
        )}
      </div>
    </>
  );
}

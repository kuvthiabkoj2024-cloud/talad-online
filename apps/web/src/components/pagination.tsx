import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { interpolate } from "@/lib/format";

/** Page numbers to show: always first/last and a window around the current page, gaps as null. */
export function pageWindow(page: number, totalPages: number, radius = 1): (number | null)[] {
  const pages: (number | null)[] = [];
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= radius) pages.push(p);
    else if (pages.at(-1) !== null) pages.push(null);
  }
  return pages;
}

/** Link-based pager ("6–9 of 9 · ‹ 1 2 ›"); `href(n)` builds the URL for page n. */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  href,
  labels,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  href: (page: number) => string;
  labels: { prevPage: string; nextPage: string; showingRange: string; pageLabel: string; pagination: string };
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const step =
    "flex h-9 items-center gap-1 rounded-full px-3 text-sm font-medium ring-1 ring-inset ring-border transition-colors";
  const enabled = `${step} bg-card hover:bg-muted`;
  const disabled = `${step} pointer-events-none text-muted-foreground/50`;

  return (
    <nav aria-label={labels.pagination} className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground">
        {interpolate(labels.showingRange, { from, to, total })}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5">
          <Link
            href={href(page - 1)}
            scroll={false}
            aria-disabled={page <= 1}
            tabIndex={page <= 1 ? -1 : undefined}
            className={page <= 1 ? disabled : enabled}
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">{labels.prevPage}</span>
          </Link>

          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} aria-hidden className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                scroll={false}
                aria-label={interpolate(labels.pageLabel, { n: p })}
                aria-current={p === page ? "page" : undefined}
                className={`flex size-9 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors ${
                  p === page ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"
                }`}
              >
                {p}
              </Link>
            ),
          )}

          <Link
            href={href(page + 1)}
            scroll={false}
            aria-disabled={page >= totalPages}
            tabIndex={page >= totalPages ? -1 : undefined}
            className={page >= totalPages ? disabled : enabled}
          >
            <span className="hidden sm:inline">{labels.nextPage}</span>
            <ChevronRight className="size-4" />
          </Link>
        </div>
      )}
    </nav>
  );
}

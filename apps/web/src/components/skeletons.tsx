import { getDictionary } from "@/app/[lang]/dictionaries";

/**
 * Skeleton building blocks for loading.tsx files and Suspense fallbacks. Shapes mirror
 * the real pages so nothing jumps when content arrives.
 */

/** One grey placeholder block. */
export function Skel({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-black/[0.07] ${className}`} />;
}

/** Wraps a page skeleton: marks it busy for assistive tech and announces "Loading…". */
export async function SkeletonPage({ className = "", children }: { className?: string; children: React.ReactNode }) {
  const { common } = await getDictionary();
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{common.loading}</span>
      {children}
    </div>
  );
}

export function CardSkel({ className = "", children }: { className?: string; children?: React.ReactNode }) {
  return <div className={`rounded-2xl bg-card shadow-sm ring-1 ring-border ${className}`}>{children}</div>;
}

export function ProductCardSkel() {
  return (
    <CardSkel className="flex w-full flex-col overflow-hidden">
      <Skel className="aspect-square rounded-none" />
      <div className="flex flex-col gap-2 p-3 sm:p-3.5">
        <Skel className="h-3.5 w-full" />
        <Skel className="h-3.5 w-2/3" />
        <Skel className="h-3 w-1/2" />
        <Skel className="mt-2 h-5 w-1/2" />
      </div>
    </CardSkel>
  );
}

/** Grid matching ProductList's columns. */
export function ProductGridSkel({ count = 12, title = true }: { count?: number; title?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {title && <Skel className="h-7 w-48" />}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: count }, (_, i) => (
          <li key={i} className={`flex ${i >= 6 ? "hidden sm:flex" : ""}`}>
            <ProductCardSkel />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Small title + description, like PageHeading. */
export function HeadingSkel() {
  return (
    <div className="flex flex-col gap-2">
      <Skel className="h-6 w-44" />
      <Skel className="h-4 w-72 max-w-full" />
    </div>
  );
}

/** A row with a square thumbnail and two text lines (cart items, order items). */
export function LineSkel({ thumb = "size-16" }: { thumb?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skel className={`${thumb} shrink-0 rounded-xl`} />
      <div className="flex flex-1 flex-col gap-2">
        <Skel className="h-4 w-3/4" />
        <Skel className="h-3 w-1/3" />
      </div>
      <Skel className="h-4 w-16" />
    </div>
  );
}

/** Right-hand order summary panel (cart, checkout, order detail). */
export function SummarySkel() {
  return (
    <CardSkel className="flex flex-col gap-3 p-5">
      <Skel className="h-5 w-32" />
      <Skel className="h-4 w-full" />
      <Skel className="h-4 w-full" />
      <Skel className="mt-2 h-7 w-2/3 self-end" />
      <Skel className="mt-2 h-12 w-full rounded-full" />
    </CardSkel>
  );
}

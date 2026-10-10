import { ChevronRight, Store } from "lucide-react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { OPEN_SHOP_URL } from "@/lib/customer";

const dots =
  "pointer-events-none absolute opacity-40 [background-image:radial-gradient(var(--primary)_1px,transparent_1px)] [background-size:8px_8px]";

/**
 * "Start your business with Taladonline" strip linking to the seller center (apps/shop).
 * One row at every size: shop icon, two lines of text, pill button; tighter on phones.
 */
export function SellerBanner({ dict }: { dict: Dictionary["home"] }) {
  return (
    <section className="relative flex items-center gap-3 overflow-hidden rounded-2xl bg-primary-soft px-3 py-3 sm:gap-4 sm:px-5 sm:py-4">
      {/* Dotted corners, as in the reference design */}
      <span aria-hidden className={`${dots} left-0 top-0 h-full w-20 [mask-image:linear-gradient(135deg,black,transparent_60%)]`} />
      <span aria-hidden className={`${dots} bottom-0 right-0 h-1/2 w-28 [mask-image:linear-gradient(315deg,black,transparent_70%)]`} />

      <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-sm sm:size-16">
        <Store className="size-6 sm:size-8" />
      </span>
      <div className="relative min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug sm:text-base">
          {dict.sellerTitle} <span className="text-primary">Taladonline</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">{dict.sellerSubtitle}</p>
      </div>
      <a
        href={OPEN_SHOP_URL}
        className="relative flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-primary py-2.5 pl-4 pr-3 text-xs font-semibold text-primary-foreground shadow-md shadow-primary/25 transition hover:brightness-110 sm:gap-1 sm:px-5 sm:py-3 sm:text-sm"
      >
        {/* "Join" on phones, "Join Now" from sm up */}
        <span className="sm:hidden">{dict.sellerCtaShort}</span>
        <span className="hidden sm:inline">{dict.sellerCta}</span>
        <ChevronRight className="size-4" />
      </a>
    </section>
  );
}

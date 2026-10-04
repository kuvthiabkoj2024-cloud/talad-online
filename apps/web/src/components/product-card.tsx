import { formatMoney, type Locale } from "@talad/shared";
import { Package, Star, Store } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "./product-image";
import type { ProductCard as Product } from "@/lib/api";
import { formatCount, formatPriceRange, interpolate, productPath } from "@/lib/format";

/** Plain (non-async) so it renders in server lists and client "load more" grids alike. */
export function ProductCard({
  product,
  locale,
  soldLabel,
}: {
  product: Product;
  locale: Locale;
  /** Dictionary template like "{n} sold". */
  soldLabel: string;
}) {
  // Discount badge only makes sense for a single price.
  const discount =
    !product.priceMax && product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round((1 - product.price / product.compareAtPrice) * 100)
      : 0;

  return (
    <Link
      href={productPath(locale, product.shop.slug, product.slug)}
      className="group flex w-full flex-col overflow-hidden rounded-xl bg-card shadow-[0_1px_3px_rgb(0_0_0/0.05)] ring-1 ring-border/70 transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 hover:ring-primary/40"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
        {product.imageUrl ? (
          <ProductImage
            src={product.imageUrl}
            alt={product.name}
            // Matches the grid: 2 cols on phones up to 6 on desktop (max-w-7xl).
            sizes="(min-width: 1024px) 210px, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/40">
            <Package className="size-14" strokeWidth={1.25} />
          </div>
        )}
        {discount > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-sale px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            -{discount}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3 sm:p-3.5">
        <p className="line-clamp-2 min-h-[2lh] text-sm font-medium leading-snug transition-colors group-hover:text-primary">
          {product.name}
        </p>
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Store className="size-3.5 shrink-0" />
          <span className="truncate">{product.shop.name}</span>
        </p>

        <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5 pt-1.5">
          <span className="text-base font-bold text-primary sm:text-lg">
            {formatPriceRange(product.price, product.priceMax, locale)}
          </span>
          {discount > 0 && (
            <span className="text-xs text-muted-foreground line-through">
              {formatMoney(product.compareAtPrice!, locale)}
            </span>
          )}
        </div>

        {(product.ratingAvg > 0 || product.soldCount > 0) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {product.ratingAvg > 0 && (
              <span className="flex items-center gap-0.5">
                <Star className="size-3.5 fill-amber-400 text-amber-400" />
                {product.ratingAvg.toFixed(1)}
              </span>
            )}
            {product.soldCount > 0 && (
              <span className="ml-auto">
                {interpolate(soldLabel, { n: formatCount(product.soldCount, locale) })}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

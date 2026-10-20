"use client";

import type { Locale } from "@talad/shared";
import { LoaderCircle, Package, Zap } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/product-image";
import type { ChatProduct } from "@/lib/chat-actions";
import { formatPriceRange, productPath } from "@/lib/format";

/** Compact product card for Market Chat replies: photo, name, price and a Buy now button. */
export function ChatProductCard({
  product: p,
  locale,
  buyNow,
  buying,
  onBuy,
}: {
  product: ChatProduct;
  locale: Locale;
  buyNow: string;
  buying: boolean;
  onBuy: () => void;
}) {
  const href = productPath(locale, p.shop.slug, p.slug);
  const discount =
    !p.priceMax && p.compareAtPrice && p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : 0;
  return (
    <div className="flex w-full min-w-0 flex-col overflow-hidden rounded-xl bg-card ring-1 ring-border/70 shadow-[0_1px_3px_rgb(0_0_0/0.05)]">
      <Link href={href} className="group flex flex-col">
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          {p.imageUrl ? (
            <ProductImage src={p.imageUrl} alt={p.name} sizes="(min-width: 768px) 200px, 45vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <span className="flex size-full items-center justify-center text-muted-foreground">
              <Package className="size-6" />
            </span>
          )}
          {discount > 0 && <span className="absolute top-1.5 left-1.5 rounded-full bg-sale px-1.5 py-0.5 text-[10px] font-bold text-white">-{discount}%</span>}
        </div>
        <div className="flex flex-col gap-0.5 px-2.5 pt-2">
          <p className="line-clamp-2 text-[13px] leading-snug font-medium group-hover:text-primary">{p.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{p.shop.name}</p>
          <p className="text-sm font-bold text-primary tabular-nums">{formatPriceRange(p.price, p.priceMax, locale)}</p>
        </div>
      </Link>
      <div className="mt-auto p-2.5 pt-2">
        <button
          type="button"
          onClick={onBuy}
          disabled={buying}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full bg-primary text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-70"
        >
          {buying ? <LoaderCircle className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
          {buyNow}
        </button>
      </div>
    </div>
  );
}

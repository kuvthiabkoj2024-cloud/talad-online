"use client";

import { formatMoney, type Locale } from "@talad/shared";
import { CircleAlert, LoaderCircle, Minus, Plus, Store } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { FeedItem, ProductDetail } from "@/lib/api";
import { addToCart } from "@/lib/cart-actions";
import { formatPriceRange, interpolate, productPath } from "@/lib/format";
import { loadBuyOptions } from "@/lib/video-actions";
import { useSession } from "../auth/session-provider";
import { BottomSheet } from "../bottom-sheet";
import { ProductImage } from "../product-image";

type Dict = Dictionary["feed"];

/**
 * Buy straight from the video: pick an option and quantity (live stock), then go to
 * checkout with just this line — the same flow as Buy now on the product page.
 */
export function BuyNowSheet({
  open,
  onClose,
  item,
  locale,
  dict,
  cartErrors,
}: {
  open: boolean;
  onClose: () => void;
  item: FeedItem;
  locale: Locale;
  dict: Dict;
  cartErrors: Dictionary["cartErrors"];
}) {
  const router = useRouter();
  const { customer, setCartCount } = useSession();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyOptions(p: ProductDetail | null) {
    if (!p) return setStatus("error");
    setProduct(p);
    // Preselect when there's exactly one option still in stock.
    const inStock = p.variants.filter((v) => v.stock > 0);
    setVariantId(p.variants.length && inStock.length === 1 ? inStock[0].id : null);
    setQuantity(1);
    setStatus("ready");
  }

  function retry() {
    setStatus("loading");
    void loadBuyOptions(item.shop.slug, item.slug).then(applyOptions);
  }

  // Mounted fresh each time the sheet opens, so stock is always live.
  useEffect(() => {
    let live = true;
    void loadBuyOptions(item.shop.slug, item.slug).then((p) => live && applyOptions(p));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, []);

  const variant = product?.variants.find((v) => v.id === variantId) ?? null;
  const needsOption = !!product?.variants.length && !variant;
  const available = variant ? variant.stock : (product?.stock ?? item.stock);
  const ownProduct = !!product && customer?.shop?.id === product.shop.id;
  const canBuy = status === "ready" && !needsOption && available > 0 && !ownProduct;
  const price = variant
    ? formatMoney(variant.price, locale)
    : formatPriceRange(product?.price ?? item.price, product?.priceMax ?? item.priceMax, locale);
  const was = variant?.regularPrice ?? (product?.priceMax === null ? product?.compareAtPrice : null);
  const image = product?.imageUrls[0] ?? item.imageUrl;

  function buy() {
    if (!customer) {
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/feed`)}`);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addToCart({ productId: item.id, variantId, quantity });
      if (!res.ok) {
        if (res.error === "UNAUTHENTICATED")
          router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/feed`)}`);
        else setError(cartErrors[res.error] ?? cartErrors.generic);
        return;
      }
      setCartCount(res.count);
      router.push(`/${locale}/checkout?items=${res.itemId}`);
    });
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={dict.buyNow} closeLabel={dict.close}>
      <div className="mx-auto flex max-w-md flex-col gap-5 pb-1">
        <div className="flex gap-3">
          <span className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
            {image && <ProductImage src={image} alt="" sizes="80px" className="object-cover" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
            <p className="mt-1 text-lg font-bold text-sale">{price}</p>
            {was != null && was > (variant?.price ?? product?.price ?? item.price) && (
              <p className="text-xs text-muted-foreground line-through">{formatMoney(was, locale)}</p>
            )}
            <p className={`text-xs ${available > 0 ? "text-muted-foreground" : "font-semibold text-sale"}`}>
              {available > 0 ? interpolate(dict.stock, { n: available }) : dict.outOfStock}
            </p>
          </div>
        </div>

        {status === "loading" && (
          <div className="flex gap-2" aria-busy>
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-10 w-24 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        )}

        {status === "error" && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-sale/10 px-4 py-3 text-sm text-sale">
            {dict.loadFailed}
            <button type="button" onClick={retry} className="font-semibold underline underline-offset-2">
              {dict.retry}
            </button>
          </div>
        )}

        {status === "ready" && product && product.variants.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-sm text-muted-foreground">{dict.option}</legend>
            <div role="radiogroup" aria-label={dict.option} className="flex flex-wrap gap-2">
              {product.variants.map((v) => {
                const selected = v.id === variantId;
                const soldOut = v.stock === 0;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={soldOut}
                    onClick={() => {
                      setVariantId(v.id);
                      setQuantity(1);
                    }}
                    className={`flex flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted-foreground/60 ${
                      selected ? "border-primary bg-primary-soft text-primary" : "border-border hover:border-primary/60"
                    }`}
                  >
                    <span className="font-medium">{v.label}</span>
                    <span className="text-xs opacity-80">
                      {soldOut ? dict.outOfStock : interpolate(dict.left, { n: v.stock })}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {status === "ready" && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{dict.quantity}</span>
            <div className="inline-flex h-11 items-center rounded-lg border border-border">
              <button
                type="button"
                aria-label={dict.decrease}
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
                className="flex h-full w-11 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Minus className="size-4" />
              </button>
              <span aria-live="polite" className="w-12 text-center tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                aria-label={dict.increase}
                disabled={quantity >= available}
                onClick={() => setQuantity((q) => q + 1)}
                className="flex h-full w-11 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <Plus className="size-4" />
              </button>
            </div>
          </div>
        )}

        {ownProduct && (
          <p className="flex items-center gap-2 rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">
            <Store className="size-4 shrink-0" />
            {dict.ownProduct}
          </p>
        )}
        {needsOption && status === "ready" && (
          <p className="-mt-2 text-sm text-muted-foreground">{dict.chooseOption}</p>
        )}
        {error && (
          <p role="alert" className="flex items-center gap-2 rounded-xl bg-sale/10 px-4 py-2.5 text-sm text-sale">
            <CircleAlert className="size-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={!canBuy || pending}
            onClick={buy}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-base font-semibold text-primary-foreground transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pending && <LoaderCircle className="size-5 animate-spin" />}
            {available > 0 || needsOption ? dict.buyNow : dict.outOfStock}
          </button>
          <Link
            href={productPath(locale, item.shop.slug, item.slug)}
            className="py-1 text-center text-sm font-semibold text-primary hover:underline"
          >
            {dict.productDetails}
          </Link>
        </div>
      </div>
    </BottomSheet>
  );
}

"use client";

import { formatMoney, type Locale } from "@talad/shared";
import { CircleAlert, CircleCheck, LoaderCircle, Minus, Plus, ShoppingCart, Store } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import type { ProductVariantOption } from "@/lib/api";
import { addToCart } from "@/lib/cart-actions";
import { SELLER_CENTER_URL } from "@/lib/customer";
import { formatPriceRange, interpolate } from "@/lib/format";
import { useSession } from "../auth/session-provider";

/**
 * Price, option picker, quantity stepper and buy buttons. On phones the buttons
 * become a bar fixed to the bottom of the screen.
 */
export function ProductPurchase({
  productId,
  shopId,
  locale,
  dict,
  cartDict,
  cartErrors,
  manageLabel,
  price,
  priceMax,
  compareAtPrice,
  stock,
  variants,
}: {
  productId: string;
  shopId: string;
  locale: Locale;
  dict: Dictionary["product"];
  cartDict: Pick<Dictionary["cart"], "added" | "viewCart">;
  cartErrors: Dictionary["cartErrors"];
  /** "Manage in Seller Center" */
  manageLabel: string;
  price: number;
  priceMax: number | null;
  compareAtPrice: number | null;
  stock: number;
  variants: ProductVariantOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { customer, setCartCount } = useSession();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"cart" | "buy" | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [variantId, setVariantId] = useState(variants.length === 1 ? variants[0].id : null);
  const [quantity, setQuantity] = useState(1);

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const available = variant ? variant.stock : stock;
  const needsOption = variants.length > 0 && !variant;
  // Shop owners can buy from other shops, but not from their own.
  const ownProduct = customer?.shop?.id === shopId;
  const canBuy = !needsOption && available > 0 && !ownProduct;

  const shownPrice = variant
    ? formatMoney(variant.price, locale)
    : formatPriceRange(price, priceMax, locale);
  const unitPrice = variant?.price ?? price;
  // A crossed-out "was" price only makes sense against a single price, not a range.
  const showCompare =
    (priceMax === null || variant !== null) &&
    compareAtPrice !== null &&
    compareAtPrice > unitPrice;

  function selectVariant(id: string) {
    setVariantId(id);
    setQuantity(1);
  }

  /** "cart": add and stay; "buy": add and go straight to checkout with just this line. */
  function add(mode: "cart" | "buy") {
    // Guests must sign in before buying (§1), then come back to this product.
    if (!customer) {
      router.push(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setFeedback(null);
    setBusy(mode);
    startTransition(async () => {
      const res = await addToCart({ productId, variantId, quantity });
      setBusy(null);
      if (!res.ok) {
        if (res.error === "UNAUTHENTICATED") router.push(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
        else setFeedback({ ok: false, message: cartErrors[res.error] ?? cartErrors.generic });
        return;
      }
      setCartCount(res.count);
      if (mode === "buy") router.push(`/${locale}/checkout?items=${res.itemId}`);
      else setFeedback({ ok: true, message: cartDict.added });
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="text-3xl font-bold text-sale sm:text-4xl">{shownPrice}</p>
        {showCompare && (
          <p className="text-base text-muted-foreground line-through">
            {formatMoney(compareAtPrice!, locale)}
          </p>
        )}
      </div>

      {variants.length > 0 && (
        <Row label={dict.option}>
          <div role="radiogroup" aria-label={dict.option} className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const selected = v.id === variantId;
              const soldOut = v.stock === 0;
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={soldOut}
                  onClick={() => selectVariant(v.id)}
                  className={`rounded-lg border px-4 py-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:border-dashed disabled:text-muted-foreground/60 ${
                    selected
                      ? "border-primary bg-primary-soft font-medium text-primary"
                      : "border-border hover:border-primary/60"
                  }`}
                >
                  {v.label}
                </button>
              );
            })}
          </div>
        </Row>
      )}

      <Row
        label={dict.quantity}
        hint={available > 0 ? interpolate(dict.stock, { n: available }) : dict.outOfStock}
      >
        <div className="inline-flex h-11 items-center rounded-lg border border-border">
          <StepButton label={dict.decrease} disabled={quantity <= 1} onClick={() => setQuantity((q) => q - 1)}>
            <Minus className="size-4" />
          </StepButton>
          <span aria-live="polite" className="w-12 text-center tabular-nums">
            {quantity}
          </span>
          <StepButton
            label={dict.increase}
            disabled={quantity >= available}
            onClick={() => setQuantity((q) => q + 1)}
          >
            <Plus className="size-4" />
          </StepButton>
        </div>
      </Row>

      {needsOption && <p className="-mt-2 text-sm text-muted-foreground">{dict.selectOption}</p>}

      {feedback && (
        <p
          role="status"
          className={`-mt-2 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm sm:max-w-md ${
            feedback.ok ? "bg-primary-soft text-primary" : "bg-sale/10 text-sale"
          }`}
        >
          {feedback.ok ? <CircleCheck className="size-4 shrink-0" /> : <CircleAlert className="size-4 shrink-0" />}
          <span className="flex-1">{feedback.message}</span>
          {feedback.ok && (
            <Link href={`/${locale}/cart`} className="font-semibold underline underline-offset-2">
              {cartDict.viewCart}
            </Link>
          )}
        </p>
      )}

      {ownProduct && (
        <div className="flex flex-col gap-2 rounded-xl bg-primary-soft px-4 py-3 text-sm sm:max-w-md">
          <p className="flex items-center gap-2 font-semibold text-primary">
            <Store className="size-4" />
            {dict.ownProduct}
          </p>
          <p className="text-muted-foreground">{dict.ownProductBody}</p>
          <a href={SELLER_CENTER_URL} className="self-start font-semibold text-primary underline underline-offset-2">
            {manageLabel}
          </a>
        </div>
      )}

      <div
        className={`fixed inset-x-0 bottom-0 z-30 grid-cols-2 gap-3 border-t border-border bg-card p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] sm:static sm:max-w-md sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none ${
          ownProduct ? "hidden" : "grid"
        }`}
      >
        <button
          type="button"
          disabled={!canBuy || pending}
          onClick={() => add("cart")}
          className="flex h-12 items-center justify-center gap-2 rounded-full border-2 border-primary px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft disabled:border-border disabled:bg-muted disabled:text-muted-foreground sm:h-14 sm:text-base"
        >
          {busy === "cart" ? <LoaderCircle className="size-5 animate-spin" /> : <ShoppingCart className="size-5" />}
          {dict.addToCart}
        </button>
        <button
          type="button"
          disabled={!canBuy || pending}
          onClick={() => add("buy")}
          className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground sm:h-14 sm:text-base"
        >
          {busy === "buy" && <LoaderCircle className="size-5 animate-spin" />}
          {available > 0 || needsOption ? dict.buyNow : dict.outOfStock}
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <div className="pt-2.5 text-muted-foreground">
        {label}
        {hint && <p className="text-xs">({hint})</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-full w-11 items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-40"
    >
      {children}
    </button>
  );
}

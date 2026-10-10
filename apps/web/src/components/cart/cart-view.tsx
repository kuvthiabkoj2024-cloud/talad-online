"use client";

import { formatMoney, MAX_CART_QUANTITY, type Locale } from "@talad/shared";
import { Package, ShoppingBag, Store, Trash2 } from "lucide-react";
import { ProductImage } from "../product-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { removeCartItem, setCartQuantity } from "@/lib/cart-actions";
import type { CartItem, CartShop } from "@/lib/cart";
import { interpolate, productPath } from "@/lib/format";
import { PageHeading } from "../account/page-heading";
import { useSession } from "../auth/session-provider";
import { QuantityStepper } from "./quantity-stepper";

type Dict = Dictionary["cart"];

export function CartView({ locale, dict, shops }: { locale: Locale; dict: Dict; shops: CartShop[] }) {
  const router = useRouter();
  const { setCartCount } = useSession();
  const [, startTransition] = useTransition();
  const allItems = useMemo(() => shops.flatMap((s) => s.items), [shops]);
  const selectable = allItems.filter((i) => i.available);

  // Selection defaults to everything that can be bought; dropped when lines disappear.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(selectable.map((i) => i.id)));
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const qty = (item: CartItem) => quantities[item.id] ?? item.quantity;
  const chosen = selectable.filter((i) => selected.has(i.id));
  const subtotal = chosen.reduce((n, i) => n + i.unitPrice * qty(i), 0);

  function toggle(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function changeQuantity(item: CartItem, next: number) {
    setQuantities((q) => ({ ...q, [item.id]: next }));
    startTransition(async () => {
      const res = await setCartQuantity(item.id, next);
      if (res.ok) setCartCount(res.count);
      router.refresh();
    });
  }

  function remove(item: CartItem) {
    toggle([item.id], false);
    startTransition(async () => {
      const res = await removeCartItem(item.id);
      if (res.ok) setCartCount(res.count);
      router.refresh();
    });
  }

  function checkout() {
    router.push(`/${locale}/checkout?items=${chosen.map((i) => i.id).join(",")}`);
  }

  if (allItems.length === 0) {
    return (
      <>
        <PageHeading title={dict.title} description={dict.description} />
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-12 text-center shadow-sm ring-1 ring-border">
          <span className="mb-1 flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
            <ShoppingBag className="size-8" strokeWidth={1.75} />
          </span>
          <h2 className="font-semibold">{dict.emptyTitle}</h2>
          <p className="max-w-xs text-sm text-muted-foreground">{dict.emptyBody}</p>
          <Link
            href={`/${locale}`}
            className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            {dict.continueShopping}
          </Link>
        </div>
      </>
    );
  }

  const allChecked = selectable.length > 0 && chosen.length === selectable.length;

  return (
    <>
      <PageHeading title={dict.title} description={dict.description} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <label className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 text-sm font-medium shadow-sm ring-1 ring-border">
            <Checkbox checked={allChecked} onChange={(on) => toggle(selectable.map((i) => i.id), on)} />
            {dict.selectAll}
            <span className="ml-auto text-muted-foreground">{interpolate(dict.selected, { n: chosen.length })}</span>
          </label>

          {shops.map(({ shop, items }) => {
            const shopSelectable = items.filter((i) => i.available);
            const shopChecked = shopSelectable.length > 0 && shopSelectable.every((i) => selected.has(i.id));
            return (
              <section key={shop.id} className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
                <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                  <Checkbox
                    checked={shopChecked}
                    disabled={shopSelectable.length === 0}
                    label={interpolate(dict.selectShop, { shop: shop.name })}
                    onChange={(on) => toggle(shopSelectable.map((i) => i.id), on)}
                  />
                  <Link href={`/${locale}/s/${shop.slug}`} className="flex min-w-0 items-center gap-2 text-sm font-semibold hover:text-primary">
                    <Store className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{shop.name}</span>
                  </Link>
                </div>
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <li key={item.id} className={`flex gap-3 px-4 py-3 ${item.available ? "" : "opacity-60"}`}>
                      <div className="pt-6">
                        <Checkbox
                          checked={item.available && selected.has(item.id)}
                          disabled={!item.available}
                          label={item.name}
                          onChange={(on) => toggle([item.id], on)}
                        />
                      </div>
                      <Link
                        href={productPath(locale, shop.slug, item.productSlug)}
                        className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted ring-1 ring-border"
                      >
                        {item.imageUrl ? (
                          <ProductImage src={item.imageUrl} alt="" sizes="80px" className="object-cover" />
                        ) : (
                          <Package className="size-6 text-muted-foreground/50" />
                        )}
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={productPath(locale, shop.slug, item.productSlug)}
                            className="line-clamp-2 text-sm font-medium hover:text-primary"
                          >
                            {item.name}
                          </Link>
                          <button
                            type="button"
                            aria-label={dict.remove}
                            onClick={() => remove(item)}
                            className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-sale/10 hover:text-sale"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        {item.variantLabel && (
                          <span className="self-start rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            {item.variantLabel}
                          </span>
                        )}
                        {item.ownShop ? (
                          <span className="text-xs font-semibold text-primary">{dict.ownShop}</span>
                        ) : !item.available ? (
                          <span className="text-xs font-semibold text-sale">{dict.unavailable}</span>
                        ) : (
                          item.stock <= 5 && (
                            <span className="text-xs text-orange-600">{interpolate(dict.onlyLeft, { n: item.stock })}</span>
                          )
                        )}
                        <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-1">
                          <LinePrice item={item} quantity={qty(item)} locale={locale} />
                          {item.available && (
                            <QuantityStepper
                              value={qty(item)}
                              max={Math.min(item.stock, MAX_CART_QUANTITY)}
                              labels={dict}
                              onChange={(n) => changeQuantity(item, n)}
                            />
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <aside className="hidden flex-col gap-3 rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border lg:sticky lg:top-28 lg:flex">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted-foreground">{dict.subtotal}</span>
            <span className="text-xl font-bold text-primary">{formatMoney(subtotal, locale)}</span>
          </div>
          <p className="text-xs text-muted-foreground">{dict.shippingNote}</p>
          <CheckoutButton disabled={chosen.length === 0} onClick={checkout}>
            {interpolate(dict.checkout, { n: chosen.length })}
          </CheckoutButton>
        </aside>
      </div>

      {/* Phones: summary pinned to the bottom of the screen, above the tab bar */}
      <div data-bottom-bar className="fixed inset-x-0 bottom-(--bottom-nav-h) z-30 flex items-center gap-3 border-t border-border bg-card px-4 py-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] lg:hidden">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{dict.subtotal}</p>
          <p className="truncate text-lg font-bold text-primary">{formatMoney(subtotal, locale)}</p>
        </div>
        <CheckoutButton disabled={chosen.length === 0} onClick={checkout}>
          {interpolate(dict.checkout, { n: chosen.length })}
        </CheckoutButton>
      </div>
    </>
  );
}

function Checkbox({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className="size-5 shrink-0 cursor-pointer rounded accent-primary disabled:cursor-not-allowed"
    />
  );
}

/** Line total, with "unit × n" (and the struck-through list price) underneath. */
function LinePrice({ item, quantity, locale }: { item: CartItem; quantity: number; locale: Locale }) {
  const discounted = item.compareAtPrice !== null && item.compareAtPrice > item.unitPrice;
  return (
    <div className="flex flex-col">
      <span className="font-bold tabular-nums text-primary">{formatMoney(item.unitPrice * quantity, locale)}</span>
      {(quantity > 1 || discounted) && (
        <span className="flex flex-wrap gap-x-1.5 text-xs tabular-nums text-muted-foreground">
          {quantity > 1 && <span>{formatMoney(item.unitPrice, locale)} × {quantity}</span>}
          {discounted && <span className="line-through">{formatMoney(item.compareAtPrice!, locale)}</span>}
        </span>
      )}
    </div>
  );
}

function CheckoutButton({
  disabled,
  onClick,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-11 shrink-0 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
    >
      {children}
    </button>
  );
}

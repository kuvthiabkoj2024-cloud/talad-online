import type { Locale } from "@talad/shared";
import { BadgeCheck, MessageCircleMore, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { listProducts, type ProductDetail } from "@/lib/api";
import { interpolate } from "@/lib/format";
import { ProductList } from "../product-grid";
import { ProductGridSkel } from "../skeletons";

/**
 * Seller summary with chat / visit actions and more products from the same shop. The
 * header renders immediately; the product row streams in behind a skeleton.
 */
export function ShopCard({
  shop,
  productId,
  locale,
  dict,
}: {
  shop: ProductDetail["shop"];
  productId: string;
  locale: Locale;
  dict: Dictionary["product"];
}) {
  const shopHref = `/${locale}/s/${shop.slug}`;
  const outline =
    "flex items-center justify-center gap-2 rounded-full border border-primary px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary-soft sm:px-5 sm:py-2.5";

  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-4 p-4 sm:p-6">
        <Link href={shopHref} className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary sm:size-20">
            {shop.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- media CDN host not configured yet
              <img src={shop.logoUrl} alt="" className="size-full object-cover" />
            ) : (
              <Store className="size-7 sm:size-9" />
            )}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-lg font-semibold">
              <span className="truncate">{shop.name}</span>
              {shop.verified && (
                <BadgeCheck aria-label={dict.verified} className="size-5 shrink-0 text-primary" />
              )}
            </span>
            <span className="block text-sm text-muted-foreground">
              {interpolate(dict.productCount, { n: shop.productCount })}
            </span>
          </span>
        </Link>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Link href={`/${locale}/chat?shop=${shop.slug}`} className={outline}>
            <MessageCircleMore className="size-5" />
            {dict.chatWithShop}
          </Link>
          <Link href={shopHref} className={outline}>
            {dict.viewShop}
          </Link>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="border-t border-border p-4 sm:p-6">
            <ProductGridSkel count={6} />
          </div>
        }
      >
        <MoreFromShop shop={shop.slug} productId={productId} locale={locale} title={dict.moreFromShop} />
      </Suspense>
    </section>
  );
}

async function MoreFromShop({
  shop,
  productId,
  locale,
  title,
}: {
  shop: string;
  productId: string;
  locale: Locale;
  title: string;
}) {
  const more = (await listProducts({ shop, exclude: productId, limit: 6 })) ?? [];
  if (more.length === 0) return null;
  return (
    <div className="border-t border-border p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-bold sm:text-xl">{title}</h2>
      <ProductList products={more} locale={locale} />
    </div>
  );
}

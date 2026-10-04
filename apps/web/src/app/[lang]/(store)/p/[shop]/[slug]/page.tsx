import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Breadcrumb } from "@/components/breadcrumb";
import { ProductGallery } from "@/components/product/product-gallery";
import { ProductPurchase } from "@/components/product/product-purchase";
import { ShareButton } from "@/components/product/share-button";
import { ShopCard } from "@/components/product/shop-card";
import { ProductGrid } from "@/components/product-grid";
import { ProductGridSkel } from "@/components/skeletons";
import { apiGet, type ProductDetail } from "@/lib/api";
import { interpolate, localized } from "@/lib/format";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

// Stock and prices change often; keep cached pages fresh.
export const revalidate = 60;

type Props = PageProps<"/[lang]/p/[shop]/[slug]">;

async function getProduct({ params }: Props): Promise<ProductDetail> {
  const { shop, slug } = await params;
  const product = await apiGet<ProductDetail>(
    `/products/${encodeURIComponent(shop)}/${encodeURIComponent(slug)}`,
  );
  if (!product) notFound();
  return product;
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const product = await getProduct(props);
  return {
    title: product.name,
    description: product.description?.slice(0, 160),
    openGraph: { images: product.imageUrls.slice(0, 1) },
  };
}

/** Product detail page: gallery + purchase panel, shop card, related products. */
export default async function ProductPage(props: Props) {
  const product = await getProduct(props);
  const locale = await getLocale();
  const { product: dict, cart: cartDict, cartErrors, account } = await getDictionary();
  const { category } = product;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    sku: product.sku,
    image: product.imageUrls,
    description: product.description ?? undefined,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "LAK",
      lowPrice: product.price,
      highPrice: product.priceMax ?? product.price,
      availability: `https://schema.org/${product.stock > 0 ? "InStock" : "OutOfStock"}`,
    },
  };

  return (
    // Bottom padding on phones leaves room for the fixed buy bar.
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pb-28 pt-4 sm:pb-8 sm:pt-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <Breadcrumb
        items={[
          { label: dict.home, href: `/${locale}` },
          ...(category.parent
            ? [{ label: localized(category.parent.name, locale), href: `/${locale}/c/${category.parent.slug}` }]
            : []),
          { label: localized(category.name, locale, category.slug), href: `/${locale}/c/${category.slug}` },
          { label: product.name },
        ]}
      />

      <section className="grid gap-6 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-6 md:grid-cols-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10">
        <div className="flex flex-col gap-4">
          <ProductGallery
            images={product.imageUrls}
            alt={product.name}
            labels={{ image: dict.image, prev: dict.prevImage, next: dict.nextImage }}
          />
          <ShareButton title={product.name} labels={{ share: dict.share, copied: dict.copied }} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <Link
              href={`/${locale}/s/${product.shop.slug}`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {product.shop.name}
            </Link>
            <h1 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">{product.name}</h1>
            {product.soldCount > 0 && (
              <p className="mt-2 text-sm text-muted-foreground">
                {interpolate(dict.sold, { n: product.soldCount.toLocaleString() })}
              </p>
            )}
          </div>

          <div className="flex items-start gap-3 self-start rounded-xl bg-muted px-4 py-3">
            <Truck className="mt-0.5 size-6 shrink-0 text-primary" />
            <div>
              <p className="font-semibold">{interpolate(dict.deliveryTitle, { shop: product.shop.name })}</p>
              <p className="text-sm text-muted-foreground">{dict.deliveryDesc}</p>
            </div>
          </div>

          <ProductPurchase
            productId={product.id}
            shopId={product.shop.id}
            manageLabel={account.manageShop}
            locale={locale}
            dict={dict}
            cartDict={cartDict}
            cartErrors={cartErrors}
            price={product.price}
            priceMax={product.priceMax}
            compareAtPrice={product.compareAtPrice}
            stock={product.stock}
            variants={product.variants}
          />
        </div>
      </section>

      {product.description && (
        <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-6">
          <h2 className="mb-3 text-lg font-bold sm:text-xl">{dict.details}</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/85 sm:text-base">
            {product.description}
          </p>
        </section>
      )}

      <ShopCard shop={product.shop} productId={product.id} locale={locale} dict={dict} />

      <Suspense fallback={<ProductGridSkel />}>
        <ProductGrid
          id="related"
          title={dict.related}
          query={{ category: category.slug, exclude: product.id, limit: 12 }}
        />
      </Suspense>
    </div>
  );
}

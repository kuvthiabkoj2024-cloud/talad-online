import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopHeader } from "@/components/shop/shop-header";
import { FreeDeliveryBadge } from "@/components/free-delivery-badge";
import { ShopProducts } from "@/components/shop/shop-products";
import { apiGet } from "@/lib/api";
import { isShopSort, shopProductsPath, type PublicShop, type ShopProductPage } from "@/lib/shop";
import { formatCount, interpolate } from "@/lib/format";
import { metaDescription, shareMetadata } from "@/lib/seo";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

type Props = PageProps<"/[lang]/s/[shop]">;

async function getShop(slug: string): Promise<PublicShop> {
  const shop = await apiGet<PublicShop>(`/shops/${encodeURIComponent(slug)}`);
  if (!shop) notFound();
  return shop;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shop: slug } = await params;
  const lang = await getLocale();
  const shop = await getShop(slug);
  const { meta } = await getDictionary();
  const stats = interpolate(meta.share.shop, { products: shop.productCount, followers: formatCount(shop.followerCount, lang) });
  const rated = shop.ratingCount > 0 ? interpolate(meta.share.shopRated, { rating: shop.ratingAvg.toFixed(1), reviews: shop.ratingCount }) : null;
  return shareMetadata({
    lang,
    path: `/s/${slug}`,
    title: shop.name,
    description: metaDescription(shop.description, rated, stats),
    // The shop's profile picture, as in a Facebook page share; its cover without one.
    image: shop.logoUrl ?? shop.coverUrl,
    type: "profile",
    keywords: [shop.name],
  });
}

/** Shop storefront (§3.2): profile, in-shop search, sort and "Load more". */
export default async function ShopPage({ params, searchParams }: Props) {
  const locale = await getLocale();
  const { shop: dict, product, auth, feed, freeDelivery } = await getDictionary();
  const { shop: slug } = await params;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const sort = isShopSort(sp.sort) ? sp.sort : "popular";

  const [shop, first] = await Promise.all([
    getShop(slug),
    apiGet<ShopProductPage>(shopProductsPath(slug, { q: q || undefined, sort, page: 1 })),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:py-8">
      <ShopHeader shop={shop} locale={locale} dict={dict} shareDict={{ ...feed, shareTitle: dict.shareTitle }} />
      {shop.freeDelivery && <FreeDeliveryBadge shopId={shop.id} offer={shop.freeDelivery} locale={locale} labels={freeDelivery} />}
      <ShopProducts
        slug={slug}
        locale={locale}
        q={q}
        sort={sort}
        initial={first ?? { items: [], page: 1, pageSize: 12, total: 0, hasMore: false }}
        dict={dict}
        soldLabel={product.sold}
        closeLabel={auth.close}
      />
    </div>
  );
}

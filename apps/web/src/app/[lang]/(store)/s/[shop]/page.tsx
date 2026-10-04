import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShopHeader } from "@/components/shop/shop-header";
import { ShopProducts } from "@/components/shop/shop-products";
import { apiGet } from "@/lib/api";
import { isShopSort, shopProductsPath, type PublicShop, type ShopProductPage } from "@/lib/shop";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

type Props = PageProps<"/[lang]/s/[shop]">;

async function getShop(slug: string): Promise<PublicShop> {
  const shop = await apiGet<PublicShop>(`/shops/${encodeURIComponent(slug)}`);
  if (!shop) notFound();
  return shop;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shop = await getShop((await params).shop);
  return {
    title: shop.name,
    description: shop.description?.slice(0, 160),
    openGraph: { images: shop.logoUrl ? [shop.logoUrl] : [] },
  };
}

/** Shop storefront (§3.2): profile, in-shop search, sort and "Load more". */
export default async function ShopPage({ params, searchParams }: Props) {
  const locale = await getLocale();
  const { shop: dict, product, auth } = await getDictionary();
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
      <ShopHeader shop={shop} locale={locale} dict={dict} />
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

import { Suspense } from "react";
import { CategoryBar } from "@/components/category-bar";
import { FlashSale } from "@/components/flash-sale";
import { HeroCarousel, type BannerSlide } from "@/components/hero-carousel";
import { ProductGrid } from "@/components/product-grid";
import { PromoCards } from "@/components/promo-cards";
import { SellerBanner } from "@/components/seller-banner";
import { ProductGridSkel } from "@/components/skeletons";
import { apiGet, type CategoryNode, type LocalizedText } from "@/lib/api";
import { localized } from "@/lib/format";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

// Re-render at most every 5 minutes so catalog changes appear without a redeploy.
export const revalidate = 300;

/** Landing page (§5 of the project scope). */
export default async function HomePage() {
  const locale = await getLocale();
  const { home } = await getDictionary();
  const [categories, banners] = await Promise.all([
    apiGet<CategoryNode[]>("/categories").then((c) => c ?? []),
    apiGet<{ id: string; title: LocalizedText; imageUrl: string; linkTarget: string | null }[]>("/banners").then((b) => b ?? []),
  ]);
  const bannerSlides: BannerSlide[] = banners.map((b) => ({
    id: b.id,
    title: localized(b.title, locale),
    imageUrl: b.imageUrl,
    href: b.linkTarget ? `/${locale}${b.linkTarget}` : null,
  }));

  return (
    <>
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-6 sm:pt-8">
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <HeroCarousel slides={home.slides} banners={bannerSlides} slideLabel={home.slide} />
        <PromoCards dict={home} />
      </div>

      <SellerBanner dict={home} />

      <CategoryBar
        locale={locale}
        categories={categories.map((c) => ({
          slug: c.slug,
          name: c.name[locale] ?? c.name.en ?? c.slug,
          iconUrl: c.iconUrl,
        }))}
        labels={{ title: home.categories, all: home.all, prev: home.prev, next: home.next }}
      />

    </div>

    {/* Flash sale: a full-width band between the page's centred sections. */}
    <Suspense fallback={<div className="h-6" />}>
      <FlashSale dict={home} locale={locale} />
    </Suspense>

    <div className="mx-auto max-w-7xl px-4 pb-6 sm:pb-8">
      <div className="mt-4 flex flex-col gap-10">
        <Suspense fallback={<ProductGridSkel />}>
          <ProductGrid id="recommended" title={home.recommended} query={{ sort: "popular" }} />
        </Suspense>
        <Suspense fallback={<ProductGridSkel />}>
          <ProductGrid id="new-arrivals" title={home.newArrivals} query={{ sort: "new" }} />
        </Suspense>
      </div>
    </div>
    </>
  );
}

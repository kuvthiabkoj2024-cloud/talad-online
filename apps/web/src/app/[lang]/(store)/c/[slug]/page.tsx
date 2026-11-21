import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { ProductList } from "@/components/product-grid";
import { apiGet, listProducts, type BrandItem, type CategoryNode } from "@/lib/api";
import { interpolate, localized } from "@/lib/format";
import { shareMetadata } from "@/lib/seo";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export const revalidate = 300;

type Props = PageProps<"/[lang]/c/[slug]">;

/** The category and its parent (when it is a subcategory), from the public tree. */
async function findCategory(slug: string) {
  const tree = (await apiGet<CategoryNode[]>("/categories")) ?? [];
  for (const top of tree) {
    if (top.slug === slug) return { category: top, parent: null };
    const child = top.children.find((c) => c.slug === slug);
    if (child) return { category: child, parent: top };
  }
  notFound();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale = await getLocale();
  const { meta } = await getDictionary();
  const { category } = await findCategory((await params).slug);
  const name = localized(category.name, locale, category.slug);
  // Brand and sort views point to the plain category page as the one to index.
  return shareMetadata({
    lang: locale,
    path: `/c/${category.slug}`,
    title: name,
    description: interpolate(meta.share.category, { name }),
    image: category.imageUrl,
    keywords: [name, ...category.children.map((c) => localized(c.name, locale, c.slug))],
  });
}

/** Brand slugs as the API makes them (anything else is ignored). */
const BRAND_SLUG = /^[a-z0-9-]{1,60}$/;

/**
 * Category listing (§5): products in the category and its subcategories. `?sort=new`;
 * `?brand=samsung` narrows them to a brand (the chips list brands with products here).
 */
export default async function CategoryPage({ params, searchParams }: Props) {
  const locale = await getLocale();
  const { catalog } = await getDictionary();
  const { slug } = await params;
  const sp = await searchParams;
  const sort = sp.sort === "new" ? "new" : "popular";
  const brand = typeof sp.brand === "string" && BRAND_SLUG.test(sp.brand) ? sp.brand : undefined;
  const { category, parent } = await findCategory(slug);
  const [products, brands] = await Promise.all([
    listProducts({ category: slug, sort, limit: 60, ...(brand && { brand }) }).then((p) => p ?? []),
    apiGet<BrandItem[]>(`/brands?category=${encodeURIComponent(slug)}`).then((b) => b ?? []),
  ]);
  /** This page with a sort and brand (each dropped when it's the default). */
  const href = (next: { sort?: "popular" | "new"; brand?: string | null }) => {
    const params = new URLSearchParams();
    const s = next.sort ?? sort;
    const b = next.brand === undefined ? brand : next.brand;
    if (s === "new") params.set("sort", "new");
    if (b) params.set("brand", b);
    const q = params.toString();
    return `/${locale}/c/${slug}${q ? `?${q}` : ""}`;
  };
  const name = localized(category.name, locale, category.slug);
  const siblings = parent ? parent.children : category.children;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <Breadcrumb
        items={[
          { label: catalog.home, href: `/${locale}` },
          { label: catalog.allCategories, href: `/${locale}/c` },
          ...(parent ? [{ label: localized(parent.name, locale, parent.slug), href: `/${locale}/c/${parent.slug}` }] : []),
          { label: name },
        ]}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">{name}</h1>
        <nav aria-label={catalog.sortBy} className="flex gap-1 rounded-full bg-muted p-1 text-sm">
          {(["popular", "new"] as const).map((s) => (
            <Link
              key={s}
              href={href({ sort: s })}
              aria-current={sort === s ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 font-medium ${sort === s ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {catalog[s]}
            </Link>
          ))}
        </nav>
      </div>
      {siblings.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {parent && (
            <Link href={`/${locale}/c/${parent.slug}`} className="shrink-0 rounded-full border bg-card px-4 py-1.5 text-sm hover:border-primary hover:text-primary">
              {localized(parent.name, locale, parent.slug)}
            </Link>
          )}
          {siblings.map((s) => (
            <Link
              key={s.id}
              href={`/${locale}/c/${s.slug}`}
              aria-current={s.slug === slug ? "page" : undefined}
              className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${
                s.slug === slug ? "border-primary bg-primary-soft font-medium text-primary" : "bg-card hover:border-primary hover:text-primary"
              }`}
            >
              {localized(s.name, locale, s.slug)}
            </Link>
          ))}
        </div>
      )}
      {/* Brands with products in this category: category → brand. */}
      {brands.length > 0 && (
        <nav aria-label={catalog.brand} className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1">
          <span className="shrink-0 text-sm font-medium text-muted-foreground">{catalog.brand}:</span>
          {[{ slug: null, name: catalog.allBrands }, ...brands].map((b) => {
            const active = (b.slug ?? undefined) === brand;
            return (
              <Link
                key={b.slug ?? "all"}
                href={href({ brand: b.slug })}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full border px-3.5 py-1 text-sm ${
                  active ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:border-primary hover:text-primary"
                }`}
              >
                {b.name}
              </Link>
            );
          })}
        </nav>
      )}
      {products.length === 0 ? (
        <p className="rounded-2xl border bg-card px-6 py-12 text-center text-muted-foreground">{catalog.empty}</p>
      ) : (
        <ProductList products={products} locale={locale} />
      )}
    </div>
  );
}

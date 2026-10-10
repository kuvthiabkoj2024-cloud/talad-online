import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/breadcrumb";
import { ProductList } from "@/components/product-grid";
import { apiGet, listProducts, type CategoryNode } from "@/lib/api";
import { localized } from "@/lib/format";
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
  const { category } = await findCategory((await params).slug);
  return { title: localized(category.name, locale, category.slug) };
}

/** Category listing (§5): products in the category and its subcategories. `?sort=new` */
export default async function CategoryPage({ params, searchParams }: Props) {
  const locale = await getLocale();
  const { catalog } = await getDictionary();
  const { slug } = await params;
  const sort = (await searchParams).sort === "new" ? "new" : "popular";
  const { category, parent } = await findCategory(slug);
  const products = (await listProducts({ category: slug, sort, limit: 60 })) ?? [];
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
              href={s === "popular" ? `/${locale}/c/${slug}` : `/${locale}/c/${slug}?sort=new`}
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
      {products.length === 0 ? (
        <p className="rounded-2xl border bg-card px-6 py-12 text-center text-muted-foreground">{catalog.empty}</p>
      ) : (
        <ProductList products={products} locale={locale} />
      )}
    </div>
  );
}

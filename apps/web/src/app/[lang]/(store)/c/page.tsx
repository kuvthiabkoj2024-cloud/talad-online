import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import { apiGet, type CategoryNode } from "@/lib/api";
import { categoryIcon } from "@/lib/category-icons";
import { localized } from "@/lib/format";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const { catalog } = await getDictionary();
  return { title: catalog.allCategories };
}

/** Every category and its subcategories. */
export default async function CategoriesPage() {
  const locale = await getLocale();
  const { catalog } = await getDictionary();
  const categories = (await apiGet<CategoryNode[]>("/categories")) ?? [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <Breadcrumb items={[{ label: catalog.home, href: `/${locale}` }, { label: catalog.allCategories }]} />
      <h1 className="text-2xl font-bold sm:text-3xl">{catalog.allCategories}</h1>
      {/* 3 per row on phones, more on wider screens; subcategories are on each category's page. */}
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {categories.map((c) => {
          const Icon = categoryIcon(c.slug);
          return (
            <li key={c.id} className="flex">
              <Link
                href={`/${locale}/c/${c.slug}`}
                className="group flex w-full flex-col items-center gap-2.5 rounded-2xl border border-border bg-card px-2 py-4 text-center transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  {c.iconUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded icon from any host
                    <img src={c.iconUrl} alt="" className="size-8 object-contain" />
                  ) : (
                    <Icon className="size-7" strokeWidth={1.9} />
                  )}
                </span>
                <span className="line-clamp-2 text-sm leading-snug font-semibold group-hover:text-primary">{localized(c.name, locale, c.slug)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

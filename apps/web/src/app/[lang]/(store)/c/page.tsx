import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumb } from "@/components/breadcrumb";
import { apiGet, type CategoryNode } from "@/lib/api";
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
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
            <Link href={`/${locale}/c/${c.slug}`} className="flex items-center gap-3 font-semibold hover:text-primary">
              <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-soft">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-uploaded icon from any host */}
                {c.iconUrl && <img src={c.iconUrl} alt="" className="size-6 object-contain" />}
              </span>
              {localized(c.name, locale, c.slug)}
            </Link>
            {c.children.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {c.children.map((s) => (
                  <Link
                    key={s.id}
                    href={`/${locale}/c/${s.slug}`}
                    className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground hover:bg-primary-soft hover:text-primary"
                  >
                    {localized(s.name, locale, s.slug)}
                  </Link>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

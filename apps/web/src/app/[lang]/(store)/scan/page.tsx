import type { Metadata } from "next";
import { Breadcrumb } from "@/components/breadcrumb";
import { PhotoSearch } from "@/components/search/photo-search";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { scan } = await getDictionary();
  return { title: scan.title, description: scan.subtitle };
}

/** "Scan to search" (§5): photo → visually similar products (+ AI keywords when configured). */
export default async function ScanPage() {
  const locale = await getLocale();
  const { scan, catalog, product } = await getDictionary();
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <Breadcrumb items={[{ label: catalog.home, href: `/${locale}` }, { label: scan.title }]} />
      <PhotoSearch locale={locale} dict={scan} soldLabel={product.sold} />
    </div>
  );
}

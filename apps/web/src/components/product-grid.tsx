import type { Locale } from "@talad/shared";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";
import { listProducts, type ProductCard as Product, type ProductQuery } from "@/lib/api";
import { ProductCard } from "./product-card";

/** Product grid section ("Recommended", "Related"…). Hidden when there is nothing to show. */
export async function ProductGrid({
  id,
  title,
  query,
}: {
  id: string;
  title: string;
  query: ProductQuery;
}) {
  const locale = await getLocale();
  const products = (await listProducts({ limit: 12, ...query })) ?? [];
  if (products.length === 0) return null;

  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="mb-4 text-xl font-bold sm:text-2xl">
        {title}
      </h2>
      <ProductList products={products} locale={locale} />
    </section>
  );
}

export async function ProductList({ products, locale }: { products: Product[]; locale: Locale }) {
  const { product: dict } = await getDictionary();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
      {products.map((p) => (
        <li key={p.id} className="flex">
          <ProductCard product={p} locale={locale} soldLabel={dict.sold} />
        </li>
      ))}
    </ul>
  );
}

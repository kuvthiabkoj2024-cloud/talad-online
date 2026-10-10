import type { Locale } from "@talad/shared";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { getDictionary } from "@/app/[lang]/dictionaries";
import { apiGet, type ProductCard as Product } from "@/lib/api";
import { Countdown } from "./countdown";
import { ProductCard } from "./product-card";

/**
 * Flash sale strip with countdown (§5): products in shops' running flash sales, biggest
 * discount first. Renders nothing when no sale is running.
 */
export async function FlashSale({ dict, locale }: { dict: Dictionary["home"]; locale: Locale }) {
  const sale = await apiGet<{ endsAt: string | null; items: Product[] }>("/products/flash-sale");
  if (!sale?.endsAt || sale.items.length === 0) return null;
  const { product } = await getDictionary();

  return (
    <section aria-labelledby="flash-sale" className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 id="flash-sale" className="text-xl font-bold text-sale sm:text-2xl">
          ⚡ {dict.flashSale}
        </h2>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          {dict.endsIn} <Countdown endsAt={sale.endsAt} />
        </span>
      </div>
      <ul className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:gap-4 sm:px-6">
        {sale.items.map((p) => (
          <li key={p.id} className="flex w-40 shrink-0 sm:w-48">
            <ProductCard product={p} locale={locale} soldLabel={product.sold} />
          </li>
        ))}
      </ul>
    </section>
  );
}

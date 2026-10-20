import type { Metadata } from "next";
import Link from "next/link";
import { ScanSearch, SearchX } from "lucide-react";
import { Breadcrumb } from "@/components/breadcrumb";
import { Pagination } from "@/components/pagination";
import { ProductList } from "@/components/product-grid";
import { apiGet, type ProductCard } from "@/lib/api";
import { interpolate } from "@/lib/format";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

type Props = PageProps<"/[lang]/search">;

const PAGE_SIZE = 24;

const readQuery = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 100) : "");

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { search } = await getDictionary();
  const q = readQuery((await searchParams).q);
  return { title: q ? interpolate(search.resultsFor, { q }) : search.title, robots: { index: false } };
}

/** Header search results (§5): `?q=&page=`. */
export default async function SearchPage({ searchParams }: Props) {
  const locale = await getLocale();
  const { search, catalog } = await getDictionary();
  const sp = await searchParams;
  const q = readQuery(sp.q);
  const page = Math.max(1, Math.min(50, Number(sp.page) || 1));
  const data = q
    ? await apiGet<{ items: ProductCard[]; total: number; page: number; pageSize: number; hasMore: boolean }>(
        `/products/search?${new URLSearchParams({ q, page: String(page), pageSize: String(PAGE_SIZE) })}`,
      )
    : null;
  const total = data?.total ?? 0;
  const photoLink = (
    <Link
      href={`/${locale}/scan`}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 hover:brightness-110"
    >
      <ScanSearch className="size-5" />
      {search.byPhoto}
    </Link>
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:py-8">
      <Breadcrumb items={[{ label: catalog.home, href: `/${locale}` }, { label: search.title }]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">{q ? interpolate(search.resultsFor, { q }) : search.title}</h1>
          {q && total > 0 && <p className="mt-1 text-sm text-muted-foreground">{interpolate(search.count, { n: total })}</p>}
        </div>
        {q && total > 0 && (
          <Link href={`/${locale}/scan`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            <ScanSearch className="size-4" />
            {search.byPhoto}
          </Link>
        )}
      </div>

      {!q ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <p className="text-muted-foreground">{search.prompt}</p>
          {photoLink}
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-14 text-center">
          <SearchX className="size-10 text-muted-foreground" />
          <p className="font-semibold">{interpolate(search.empty, { q })}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{search.emptyHint}</p>
          <div className="mt-2">{photoLink}</div>
        </div>
      ) : (
        <>
          <ProductList products={data!.items} locale={locale} />
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            totalPages={Math.ceil(total / PAGE_SIZE)}
            href={(p) => `/${locale}/search?${new URLSearchParams({ q, ...(p > 1 && { page: String(p) }) })}`}
            labels={search}
          />
        </>
      )}
    </div>
  );
}

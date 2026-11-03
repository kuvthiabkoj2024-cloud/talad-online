import { formatPhone, guaranteeEnd } from "@talad/shared";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/account/print-button";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";
import { interpolate } from "@/lib/format";
import { formatDate, type OrderDetail } from "@/lib/orders";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";

type Props = PageProps<"/[lang]/guarantee/[number]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { number } = await params;
  return { title: number, robots: { index: false } };
}

/** The guarantee certificates of a completed order, one per product, ready to print. */
export default async function GuaranteePage({ params }: Props) {
  const locale = await getLocale();
  const { account: dict } = await getDictionary();
  const g = dict.guarantee;
  const { number } = await params;
  await requireCustomer(locale, `/${locale}/guarantee/${number}`);

  const order = await apiGetAsCustomer<OrderDetail>(`/me/orders/${encodeURIComponent(number)}`);
  const items = order?.items.filter((i) => i.guarantee) ?? [];
  if (!order?.completedAt || items.length === 0) notFound();
  const start = new Date(order.completedAt);
  const customer = order.shippingAddress;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/${locale}/account/orders/${encodeURIComponent(order.number)}`} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {g.back}
        </Link>
        <PrintButton label={g.print} />
      </div>
      {items.map((item) => (
        <article key={item.sku} className="break-inside-avoid rounded-2xl border-2 border-primary/40 bg-card p-6 sm:p-8 print:mb-6">
          <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
            <div>
              <p className="text-sm font-semibold text-primary">MC Mart</p>
              <h1 className="text-xl font-bold sm:text-2xl">{g.title}</h1>
            </div>
            <ShieldCheck className="size-10 shrink-0 text-primary" strokeWidth={1.5} />
          </header>
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Detail label={g.product} value={item.variant ? `${item.name} (${item.variant})` : item.name} />
            <Detail label={g.quantity} value={String(item.quantity)} />
            <Detail label={g.sku} value={item.sku} />
            <Detail label={g.order} value={order.number} />
            <Detail label={g.shop} value={order.shop.name} />
            <Detail label={g.customer} value={`${customer.recipientName} · ${formatPhone(customer.phone)}`} />
          </dl>
          <div className="mt-5 grid gap-3 rounded-xl bg-primary-soft p-4 text-sm sm:grid-cols-3">
            <Detail label={g.period} value={interpolate(dict.guarantee.units[item.guarantee!.unit], { n: item.guarantee!.duration })} />
            <Detail label={g.starts} value={formatDate(start.toISOString(), locale)} />
            <Detail label={g.ends} value={formatDate(guaranteeEnd(start, item.guarantee!.duration, item.guarantee!.unit).toISOString(), locale)} />
          </div>
          {item.guarantee!.terms && (
            <section className="mt-5 text-sm">
              <h2 className="font-semibold">{g.terms}</h2>
              <p className="mt-1 whitespace-pre-line text-muted-foreground">{item.guarantee!.terms}</p>
            </section>
          )}
          <p className="mt-5 text-xs text-muted-foreground">{interpolate(g.footer, { shop: order.shop.name })}</p>
        </article>
      ))}
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{value}</dd>
    </div>
  );
}

import { formatMoney } from "@talad/shared";
import { ChevronRight, CircleCheckBig, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { SimulatePaymentButton } from "@/components/cart/simulate-payment-button";
import { interpolate } from "@/lib/format";
import type { OrderDetail } from "@/lib/orders";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { checkout } = await getDictionary();
  return { title: checkout.successTitle, robots: { index: false } };
}

/** Shown after placing an order: one card per shop order (`?orders=TL…,TL…`). */
export default async function CheckoutSuccessPage({ searchParams }: PageProps<"/[lang]/checkout/success">) {
  const locale = await getLocale();
  const { checkout: dict, account } = await getDictionary();
  const { orders: param } = await searchParams;
  const numbers = (typeof param === "string" ? param : "").split(",").filter(Boolean).slice(0, 20);
  await requireCustomer(locale, `/${locale}/checkout/success?orders=${numbers.join(",")}`);

  const orders = (
    await Promise.all(numbers.map((n) => apiGetAsCustomer<OrderDetail>(`/me/orders/${encodeURIComponent(n)}`)))
  ).filter((o): o is OrderDetail => o !== null);
  if (orders.length === 0) redirect(`/${locale}/account/orders`);

  const method = orders[0].payment?.method;
  const grandTotal = formatMoney(orders.reduce((n, o) => n + o.total, 0), locale);
  const verifying = orders.every((o) => o.awaitingConfirmation);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8 sm:py-12">
      <section className="flex flex-col items-center gap-3 rounded-3xl bg-card px-6 py-8 text-center shadow-sm ring-1 ring-border">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary">
          <CircleCheckBig className="size-9" />
        </span>
        <h1 className="text-2xl font-bold">{dict.successTitle}</h1>
        <p className="text-sm text-muted-foreground">{dict.successBody}</p>
        {orders.length > 1 && (
          <p className="text-sm text-muted-foreground">{interpolate(dict.successSplit, { n: orders.length })}</p>
        )}

        {method === "COD" && (
          <p className="mt-2 w-full rounded-2xl bg-primary-soft px-4 py-3 text-sm font-medium text-primary">
            {account.paymentMethod.COD} · {interpolate(dict.codNote, { amount: grandTotal })}
          </p>
        )}
        {method && method !== "COD" && verifying && (
          <p className="mt-2 w-full rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-800">
            <span className="font-semibold">{dict.verifying}</span> · {dict.slipReceived}
          </p>
        )}
      </section>

      <ul className="flex flex-col gap-3">
        {orders.map((o) => (
          <li key={o.number} className="flex flex-col gap-2">
            <Link
              href={`/${locale}/account/orders/${o.number}`}
              className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border transition-shadow hover:shadow-md"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <Store className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{o.shop.name}</span>
                <span className="block font-mono text-xs text-muted-foreground">{o.number}</span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <OrderStatusBadge
                  status={o.status}
                  label={o.awaitingConfirmation ? dict.verifying : account.orderStatus[o.status]}
                />
                <span className="text-sm font-bold text-primary">{formatMoney(o.total, locale)}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
            {o.payment?.status === "PENDING" && o.payment.method !== "COD" && (
              <SimulatePaymentButton orderNumber={o.number} label={dict.simulatePayment} />
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link
          href={`/${locale}/account/orders`}
          className="flex h-11 items-center justify-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110"
        >
          {dict.viewOrders}
        </Link>
        <Link
          href={`/${locale}`}
          className="flex h-11 items-center justify-center rounded-full border border-border px-6 text-sm font-semibold transition-colors hover:bg-muted"
        >
          {account.startShopping}
        </Link>
      </div>
    </div>
  );
}

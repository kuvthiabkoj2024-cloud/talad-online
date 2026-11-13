import { ChevronRight, PackageSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { OrderThumb } from "@/components/account/order-thumb";
import { TrackOrder } from "@/components/track/track-order";
import { interpolate } from "@/lib/format";
import { formatDate, type OrderList, type OrderSummary } from "@/lib/orders";
import { apiGetAsCustomer, getCurrentCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

type Props = PageProps<"/[lang]/track">;

export async function generateMetadata(): Promise<Metadata> {
  const { track } = await getDictionary();
  return { title: track.title, description: track.subtitle };
}

/**
 * Order tracking: anyone with the order number and a phone number on it (the buyer or the
 * receiver). Signed in, the orders on their way are listed too, one tap from their details.
 */
export default async function TrackPage({ searchParams }: Props) {
  const locale = await getLocale();
  const { track, account } = await getDictionary();
  const raw = (await searchParams).number;
  const initialNumber = typeof raw === "string" ? raw.slice(0, 40).toUpperCase() : "";

  const customer = await getCurrentCustomer();
  const coming: OrderSummary[] = [];
  if (customer) {
    const [toReceive, toShip] = await Promise.all([
      apiGetAsCustomer<OrderList>("/me/orders?tab=to-receive&pageSize=5"),
      apiGetAsCustomer<OrderList>("/me/orders?tab=to-ship&pageSize=5"),
    ]);
    coming.push(...(toReceive?.orders ?? []), ...(toShip?.orders ?? []));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:py-8">
      <header className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <PackageSearch className="size-6" />
        </span>
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{track.title}</h1>
          <p className="text-sm text-muted-foreground">{track.subtitle}</p>
        </div>
      </header>

      <TrackOrder
        locale={locale}
        initialNumber={initialNumber}
        labels={{
          ...track,
          account: {
            orderStatus: account.orderStatus,
            stepPlaced: account.stepPlaced,
            stepConfirmed: account.stepConfirmed,
            stepShipped: account.stepShipped,
            stepCompleted: account.stepCompleted,
            stepReadyPickup: account.stepReadyPickup,
            stepWaitingPayment: account.stepWaitingPayment,
            stepWaitingShip: account.stepWaitingShip,
            stepWaitingPickup: account.stepWaitingPickup,
            stepWaitingConfirm: account.stepWaitingConfirm,
            timelinePlaced: account.timelinePlaced,
            autoComplete: account.autoComplete,
            itemOne: account.itemOne,
            itemMany: account.itemMany,
          },
        }}
      />

      {customer && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold">{track.yourOrders}</h2>
          {coming.length === 0 ? (
            <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-border">{track.yourOrdersEmpty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {coming.map((o) => (
                <li key={o.number}>
                  <Link
                    href={`/${locale}/account/orders/${encodeURIComponent(o.number)}`}
                    className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border transition hover:ring-primary"
                  >
                    <OrderThumb src={o.items[0]?.imageUrl ?? null} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{o.shop.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{o.number}</span> · {formatDate(o.createdAt, locale)} ·{" "}
                        {o.itemCount === 1 ? account.itemOne : interpolate(account.itemMany, { n: o.itemCount })}
                      </p>
                    </div>
                    <OrderStatusBadge status={o.status} label={account.orderStatus[o.status]} />
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

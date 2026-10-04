import { formatMoney, isOrderTab, type OrderTab } from "@talad/shared";
import {
  ChevronRight,
  CircleCheckBig,
  CircleX,
  LayoutList,
  Package,
  PackageOpen,
  RotateCcw,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { OrderThumb } from "@/components/account/order-thumb";
import { PageHeading } from "@/components/account/page-heading";
import { Pagination } from "@/components/pagination";
import { interpolate } from "@/lib/format";
import { formatDate, type OrderList } from "@/lib/orders";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { account } = await getDictionary();
  return { title: account.ordersTitle, robots: { index: false } };
}

/** Order history with status tabs (?status=to-pay…), mapped via ORDER_TABS in @talad/shared. */
export default async function OrdersPage({ searchParams }: PageProps<"/[lang]/account/orders">) {
  const locale = await getLocale();
  const { account: dict, checkout: checkoutDict } = await getDictionary();
  const { status, page: pageParam } = await searchParams;
  const active: OrderTab | "all" = isOrderTab(status) ? status : "all";
  const page = Math.max(1, Number.parseInt(typeof pageParam === "string" ? pageParam : "", 10) || 1);
  const base = `/${locale}/account/orders`;

  /** URL for a tab + page; page 1 and the "all" tab are left out to keep links clean. */
  const listHref = (tab: OrderTab | "all", p = 1) => {
    const params = new URLSearchParams();
    if (tab !== "all") params.set("status", tab);
    if (p > 1) params.set("page", String(p));
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };

  await requireCustomer(locale, listHref(active, page));

  const apiQuery = new URLSearchParams({ page: String(page) });
  if (active !== "all") apiQuery.set("tab", active);
  const data = await apiGetAsCustomer<OrderList>(`/me/orders?${apiQuery}`);
  // e.g. the last order on a page was cancelled and moved tabs — go to the last page that exists.
  if (data && page > data.totalPages) redirect(listHref(active, data.totalPages));
  const orders = data?.orders ?? [];

  const tabs: { key: OrderTab | "all"; label: string; icon: LucideIcon }[] = [
    { key: "all", label: dict.allOrders, icon: LayoutList },
    { key: "to-pay", label: dict.toPay, icon: Wallet },
    { key: "to-ship", label: dict.toShip, icon: Package },
    { key: "to-receive", label: dict.toReceive, icon: Truck },
    { key: "completed", label: dict.completed, icon: CircleCheckBig },
    { key: "cancelled", label: dict.cancelled, icon: CircleX },
    { key: "refund", label: dict.refund, icon: RotateCcw },
  ];

  return (
    <>
      <PageHeading title={dict.ordersTitle} description={dict.ordersDescription} />

      <nav
        aria-label={dict.ordersTitle}
        className="no-scrollbar sticky top-(--header-h) z-10 -mx-4 flex overflow-x-auto border-b border-border bg-background/95 px-2 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:bg-card sm:px-1.5 sm:py-1.5 sm:shadow-sm"
      >
        {tabs.map(({ key, label, icon: Icon }) => {
          const selected = key === active;
          const count = data?.counts[key] ?? 0;
          return (
            <Link
              key={key}
              href={listHref(key)}
              scroll={false}
              aria-current={selected ? "page" : undefined}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-colors sm:py-2 ${
                selected
                  ? "bg-primary-soft font-semibold text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
              {count > 0 && (
                <span
                  className={`min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 ${
                    selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl bg-card px-6 py-10 text-center shadow-sm ring-1 ring-border sm:py-12">
          <span className="mb-1 flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
            <PackageOpen className="size-7" strokeWidth={1.75} />
          </span>
          <h2 className="font-semibold">{active === "all" ? dict.noOrders : dict.noOrdersInTab}</h2>
          <p className="max-w-xs text-sm text-muted-foreground">
            {active === "all" ? dict.noOrdersBody : dict.noOrdersInTabBody}
          </p>
          <Link
            href={`/${locale}`}
            className="mt-3 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110"
          >
            {dict.startShopping}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => {
            const href = `${base}/${order.number}`;
            const hidden = order.itemCount - order.items.length;
            return (
              <li key={order.number} className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <Store className="size-4 shrink-0 text-primary" />
                    <span className="truncate">{order.shop.name}</span>
                  </span>
                  <OrderStatusBadge
                    status={order.status}
                    label={order.awaitingConfirmation ? checkoutDict.verifying : dict.orderStatus[order.status]}
                  />
                </div>

                <Link href={href} className="flex flex-col gap-3 px-4 py-3">
                  {order.items.map((item) => (
                    <div key={item.sku} className="flex items-center gap-3">
                      <OrderThumb src={item.imageUrl} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-medium">{item.name}</p>
                        {item.variant && <p className="text-xs text-muted-foreground">{item.variant}</p>}
                        <p className="text-xs text-muted-foreground">x{item.quantity}</p>
                      </div>
                      <span className="text-sm tabular-nums">{formatMoney(item.lineTotal, locale)}</span>
                    </div>
                  ))}
                  {hidden > 0 && <p className="text-xs text-muted-foreground">+{hidden}</p>}
                </Link>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-4 py-2.5">
                  <p className="text-xs text-muted-foreground">
                    {order.number} · {formatDate(order.createdAt, locale)}
                  </p>
                  <div className="flex items-center gap-3">
                    <p className="text-sm">
                      <span className="text-muted-foreground">
                        {order.itemCount === 1 ? dict.itemOne : interpolate(dict.itemMany, { n: order.itemCount })} ·{" "}
                      </span>
                      <span className="font-bold text-primary">{formatMoney(order.total, locale)}</span>
                    </p>
                    <Link
                      href={href}
                      className="flex items-center gap-0.5 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
                    >
                      {dict.viewDetails}
                      <ChevronRight className="size-3.5" />
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && (
        <Pagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          totalPages={data.totalPages}
          href={(p) => listHref(active, p)}
          labels={dict}
        />
      )}
    </>
  );
}

import { formatMoney, type Locale } from "@talad/shared";
import { ChevronRight, Store } from "lucide-react";
import Link from "next/link";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { interpolate } from "@/lib/format";
import { formatDate, type OrderSummary } from "@/lib/orders";
import { OrderStatusBadge } from "./order-status-badge";
import { OrderThumb } from "./order-thumb";

/** One order in a list (order history, recent orders under an empty cart): shop, items, total. */
export function OrderCard({
  order,
  locale,
  dict,
  checkoutDict,
}: {
  order: OrderSummary;
  locale: Locale;
  dict: Dictionary["account"];
  checkoutDict: Dictionary["checkout"];
}) {
  const href = `/${locale}/account/orders/${order.number}`;
  const hidden = order.itemCount - order.items.length;
  return (
    <li className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Store className="size-4 shrink-0 text-primary" />
          <span className="truncate">{order.shop.name}</span>
        </span>
        <OrderStatusBadge
          status={order.status}
          label={order.awaitingConfirmation ? checkoutDict.verifying : order.paymentCheck === "rejected" ? checkoutDict.slipRejectedTitle : dict.orderStatus[order.status]}
        />
      </div>

      <Link href={href} className="flex flex-1 flex-col gap-3 px-4 py-3">
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
}

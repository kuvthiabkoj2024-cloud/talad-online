"use client";

import { formatPhone, provinceName, type Locale } from "@talad/shared";
import { Check, LoaderCircle, MapPin, PackageSearch, Store, Truck, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import type { Dictionary } from "@/app/[lang]/dictionaries";
import { OrderProgress } from "@/components/account/order-progress";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { OrderThumb } from "@/components/account/order-thumb";
import { useSession } from "@/components/auth/session-provider";
import { interpolate } from "@/lib/format";
import { formatDate, type TrackedOrder } from "@/lib/orders";
import { trackOrder } from "@/lib/track-actions";

type Account = Dictionary["account"];
export type TrackLabels = Dictionary["track"] & {
  account: Pick<Account, "orderStatus" | "stepPlaced" | "stepConfirmed" | "stepShipped" | "stepCompleted" | "stepReadyPickup" | "stepWaitingPayment" | "stepWaitingShip" | "stepWaitingPickup" | "stepWaitingConfirm" | "timelinePlaced" | "autoComplete" | "itemOne" | "itemMany">;
};

/** Checked again this often while a result shows, so a parcel's progress appears without reloading. */
const REFRESH_MS = 60_000;

/**
 * Order tracking: order number + a phone number on the order (the buyer's or the receiver's),
 * then where it is — progress, courier and tracking number, and its updates.
 */
export function TrackOrder({ locale, labels, initialNumber }: { locale: Locale; labels: TrackLabels; initialNumber: string }) {
  const { customer } = useSession();
  const [number, setNumber] = useState(initialNumber);
  // null until typed: signed in, their own phone is filled in (it's usually theirs).
  const [phone, setPhone] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const a = labels.account;

  const phoneValue = phone ?? (customer?.phone ? formatPhone(customer.phone) : "");

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    start(async () => {
      const res = await trackOrder(number, phoneValue);
      if (res.ok) setOrder(res.order);
      else setError(labels[res.error]);
    });
  }

  // While a result shows, it refreshes quietly (and stops when another order is looked up).
  useEffect(() => {
    if (!order) return;
    const id = setInterval(() => {
      void trackOrder(order.number, phoneValue).then((res) => res.ok && setOrder(res.order));
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [order, phoneValue]);

  if (order) {
    const latest = order.history.at(-1);
    return (
      <div className="flex flex-col gap-4">
        <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-lg font-bold tracking-wide">{order.number}</p>
              <p className="text-sm text-muted-foreground">
                {interpolate(labels.placedOn, { date: formatDate(order.createdAt, locale, true) })} ·{" "}
                <Link href={`/${locale}/s/${order.shop.slug}`} className="font-medium text-foreground hover:text-primary">
                  {interpolate(labels.from, { shop: order.shop.name })}
                </Link>
              </p>
            </div>
            <OrderStatusBadge status={order.status} label={order.pickup && order.status === "SHIPPED" ? a.stepReadyPickup : a.orderStatus[order.status]} />
          </div>
          {order.status !== "CANCELLED" && (
            <div className="mt-5">
              <OrderProgress
                status={order.status}
                labels={[a.stepPlaced, a.stepConfirmed, order.pickup ? a.stepReadyPickup : a.stepShipped, a.stepCompleted]}
                waitingLabels={[a.stepPlaced, a.stepWaitingPayment, order.pickup ? a.stepWaitingPickup : a.stepWaitingShip, a.stepWaitingConfirm]}
              />
            </div>
          )}
          {order.autoConfirmAt && <p className="mt-4 text-sm text-muted-foreground">{interpolate(a.autoComplete, { date: formatDate(order.autoConfirmAt, locale) })}</p>}
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="flex flex-col gap-2 rounded-2xl bg-card p-4 text-sm shadow-sm ring-1 ring-border sm:p-5">
            {order.pickup ? (
              <p className="flex items-center gap-2 font-semibold text-primary">
                <Store className="size-4" />
                {labels.pickup}
              </p>
            ) : (
              order.destination && (
                <Row icon={MapPin} label={labels.deliverTo} value={[order.destination.district, provinceName(order.destination.province, locale)].filter(Boolean).join(", ")} />
              )
            )}
            {order.urgentDelivery && (
              <p className="flex items-center gap-2 font-semibold text-sale">
                <Zap className="size-4" />
                {labels.urgent}
              </p>
            )}
            {order.deliveryProvider && <Row icon={Truck} label={labels.carrier} value={order.deliveryProvider} />}
            {order.trackingNumber && <Row icon={PackageSearch} label={labels.trackingNumber} value={<span className="select-all font-mono">{order.trackingNumber}</span>} />}
            <ul className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
              {order.items.map((item, i) => (
                <li key={i} className="flex items-center gap-3">
                  <OrderThumb src={item.imageUrl} size="sm" />
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.variant ? `${item.variant} · ` : ""}x{item.quantity}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-5">
            <h2 className="mb-3 text-sm font-semibold">{labels.history}</h2>
            <ol className="relative flex flex-col gap-4 border-l-2 border-border pl-5">
              {[...order.history].reverse().map((h) => (
                <li key={`${h.status}-${h.at}`} className="relative">
                  <span
                    aria-hidden
                    className={`absolute -left-[31px] top-0 flex size-5 items-center justify-center rounded-full ring-4 ring-card ${h === latest ? "bg-primary text-primary-foreground" : "bg-primary/60 text-primary-foreground"}`}
                  >
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                  <p className="text-sm font-medium">{h.status === "PENDING" ? a.timelinePlaced : a.orderStatus[h.status]}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(h.at, locale, true)}</p>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">{labels.updatedLive}</p>
          </section>
        </div>

        <div className="flex flex-wrap gap-3">
          {customer && (
            <Link
              href={`/${locale}/account/orders/${encodeURIComponent(order.number)}`}
              className="flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110"
            >
              {labels.viewDetails}
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOrder(null)}
            className="flex h-11 items-center rounded-full border border-border px-6 text-sm font-semibold hover:bg-muted"
          >
            {labels.another}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border sm:p-6">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{labels.number}</span>
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value.toUpperCase())}
          placeholder={labels.numberPlaceholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={40}
          required
          className="h-12 rounded-xl border border-border bg-background px-4 font-mono tracking-wide outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
        <span className="text-xs text-muted-foreground">{labels.numberHint}</span>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">{labels.phone}</span>
        <input
          type="tel"
          value={phoneValue}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={labels.phonePlaceholder}
          autoComplete="tel"
          maxLength={30}
          required
          className="h-12 rounded-xl border border-border bg-background px-4 outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-sale">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !number.trim() || !phoneValue.trim()}
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
      >
        {pending ? <LoaderCircle className="size-5 animate-spin" /> : <PackageSearch className="size-5" />}
        {pending ? labels.checking : labels.submit}
      </button>
    </form>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="ml-auto text-right font-medium">{value}</span>
    </div>
  );
}

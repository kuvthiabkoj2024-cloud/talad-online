import { formatMoney, formatPhone, provinceName, SLIP_PAYMENT_METHODS } from "@talad/shared";
import { ArrowLeft, Check, CircleAlert, CircleX, Clock, CreditCard, LoaderCircle, MapPin, MessageCircleMore, MessageSquareText, RotateCcw, Store, TriangleAlert, Truck, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OrderProgress } from "@/components/account/order-progress";
import { OrderStatusBadge } from "@/components/account/order-status-badge";
import { OrderThumb } from "@/components/account/order-thumb";
import { CancelOrderButton } from "@/components/account/cancel-order-button";
import { ReceiveOrderButton } from "@/components/account/receive-order-button";
import { ShippingBill } from "@/components/account/shipping-bill";
import { OrderPayment } from "@/components/cart/order-payment";
import { interpolate, productPath } from "@/lib/format";
import { formatDate, type OrderDetail, type PaymentStatus } from "@/lib/orders";
import { requireCustomer } from "@/lib/require-customer";
import { apiGetAsCustomer } from "@/lib/session";
import { getDictionary, getLocale } from "@/app/[lang]/dictionaries";
import { RefreshOnLive } from "@/components/realtime/refresh-on-live";

type Props = PageProps<"/[lang]/account/orders/[number]">;

/** System notes are stored in English; show them in the page's language when we know them. */
function noteText(note: string, notes: Record<string, string>): string {
  if (note.startsWith("Payment slip rejected: ")) return interpolate(notes.slipRejected, { reason: note.slice(23) });
  return notes[note] ?? note;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { number } = await params;
  return { title: number, robots: { index: false } };
}

const PAYMENT_TONE: Record<PaymentStatus, string> = {
  PAID: "bg-primary-soft text-primary",
  PENDING: "bg-amber-50 text-amber-700",
  FAILED: "bg-sale/10 text-sale",
  REFUNDED: "bg-sky-50 text-sky-700",
  EXPIRED: "bg-muted text-muted-foreground",
};

export default async function OrderDetailPage({ params }: Props) {
  const locale = await getLocale();
  const { account: dict, checkout: checkoutDict, cartErrors, auth } = await getDictionary();
  const { number } = await params;
  await requireCustomer(locale, `/${locale}/account/orders/${number}`);

  const order = await apiGetAsCustomer<OrderDetail>(`/me/orders/${encodeURIComponent(number)}`);
  if (!order) notFound();

  const address = order.shippingAddress;
  const refundNote = order.history.findLast((h) => h.status === "RETURN_REQUESTED")?.note;
  const first = order.items[0];
  const payment = order.payment;
  // Manual transfer still open: the customer pays Taladonline (QR + slips) or sends new slips.
  const payable =
    order.status === "PENDING" &&
    payment?.status === "PENDING" &&
    SLIP_PAYMENT_METHODS.includes(payment.method) &&
    order.transfer !== null;
  // The step in progress, shown on top of the timeline.
  const next =
    order.status === "PENDING"
      ? order.paymentCheck === "reviewing"
        ? dict.timelineNext.reviewing
        : order.paymentCheck === "rejected"
          ? dict.timelineNext.rejected
          : dict.timelineNext.payment
      : order.status === "CONFIRMED" || order.status === "PACKED"
        ? dict.timelineNext.preparing
        : order.status === "SHIPPED" || order.status === "DELIVERED"
          ? order.pickup
            ? dict.timelineNext.pickup
            : dict.timelineNext.receive
          : order.status === "RETURN_REQUESTED"
            ? dict.timelineNext.return
            : null;
  const statusLabel = order.awaitingConfirmation
    ? checkoutDict.verifying
    : order.paymentCheck === "rejected"
      ? checkoutDict.slipRejectedTitle
      : order.pickup && order.status === "SHIPPED"
        ? dict.stepReadyPickup
        : dict.orderStatus[order.status];

  return (
    <>
      {/* The shop packs or ships it: the status updates here live. */}
      <RefreshOnLive />
      <Link
        href={`/${locale}/account/orders`}
        className="flex items-center gap-1.5 self-start text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {dict.backToOrders}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{dict.orderNumber}</p>
          <h1 className="font-mono text-lg font-bold tracking-wide sm:text-xl">{order.number}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {interpolate(dict.placedOn, { date: formatDate(order.createdAt, locale, true) })}
          </p>
        </div>
        <OrderStatusBadge status={order.status} label={statusLabel} />
      </header>

      {order.status === "PENDING" && (payable || order.paymentDueAt) && (
        <div className="flex flex-col gap-3">
          {order.paymentDueAt && order.paymentCheck !== "reviewing" && (
            <Notice tone="amber" icon={Clock}>
              {interpolate(dict.payBefore, { date: formatDate(order.paymentDueAt, locale, true) })}
            </Notice>
          )}
          {payable && (
            <OrderPayment
              locale={locale}
              orderNumber={order.number}
              amount={formatMoney(order.orderTotal, locale)}
              transfer={order.transfer!}
              check={order.paymentCheck}
              slips={order.slips}
              dict={checkoutDict}
              cartErrors={cartErrors}
              closeLabel={auth.close}
            />
          )}
          {/* Payment rejected (or never sent): the customer may give up on the order. */}
          {order.cancellable && order.paymentCheck === "rejected" && <CancelOrderButton orderNumber={order.number} labels={dict} />}
        </div>
      )}
      {(order.status === "SHIPPED" || order.status === "DELIVERED") && (
        <Notice tone="green" icon={Truck} title={dict.receiveTitle}>
          <span className="flex flex-col gap-3">
            {order.autoConfirmAt && interpolate(dict.autoComplete, { date: formatDate(order.autoConfirmAt, locale) })}
            {/* Points only for confirming: an order that completes by itself earns none. */}
            {order.pointsOnReceive > 0 && (
              <span className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {interpolate(dict.pointsWarning, { n: order.pointsOnReceive })}
              </span>
            )}
            <ReceiveOrderButton orderNumber={order.number} labels={dict} />
          </span>
        </Notice>
      )}
      {order.status === "CANCELLED" && (
        <Notice tone="grey" icon={CircleX} title={dict.cancelledTitle}>
          {order.cancelReason && noteText(order.cancelReason, dict.timelineNotes)}
          {/* A paid transfer: Taladonline sends the money back. */}
          {payment && payment.method !== "COD" && (payment.status === "PAID" || payment.refundedAt) && (
            <span className="mt-1 block font-medium text-foreground">
              {payment.refundedAt
                ? interpolate(checkoutDict.refundDone, { amount: formatMoney(payment.amount, locale), date: formatDate(payment.refundedAt, locale) })
                : interpolate(checkoutDict.refundPending, { amount: formatMoney(payment.amount, locale) })}
            </span>
          )}
        </Notice>
      )}
      {order.status === "RETURN_REQUESTED" && (
        <Notice tone="orange" icon={RotateCcw} title={dict.refundTitle}>
          {refundNote && <span className="font-medium">“{refundNote}” · </span>}
          {dict.refundBody}
        </Notice>
      )}

      {order.status !== "CANCELLED" && (
        <Card className="px-3 py-5 sm:px-6">
          <OrderProgress
            status={order.status}
            labels={[
              dict.stepPlaced,
              payment?.method === "COD" ? dict.stepConfirmed : dict.stepPaid,
              order.pickup ? dict.stepReadyPickup : dict.stepShipped,
              dict.stepCompleted,
            ]}
            waitingLabels={[
              dict.stepPlaced,
              dict.stepWaitingPayment,
              order.pickup ? dict.stepWaitingPickup : dict.stepWaitingShip,
              dict.stepWaitingConfirm,
            ]}
          />
        </Card>
      )}

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card>
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <Link
                href={`/${locale}/s/${order.shop.slug}`}
                className="flex min-w-0 items-center gap-2 text-sm font-semibold hover:text-primary"
              >
                <Store className="size-4 shrink-0 text-primary" />
                <span className="truncate">{order.shop.name}</span>
              </Link>
              <Link
                href={`/${locale}/messages/new?shop=${order.shop.slug}&order=${encodeURIComponent(order.number)}`}
                className="flex shrink-0 items-center gap-1 rounded-full border border-primary/40 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
              >
                <MessageCircleMore className="size-3.5" />
                {dict.chatWithShop}
              </Link>
            </div>
            <ul className="divide-y divide-border">
              {order.items.map((item) => (
                <li key={item.sku} className="flex gap-3 px-4 py-3">
                  <OrderThumb src={item.imageUrl} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Link
                      href={productPath(locale, order.shop.slug, item.productSlug)}
                      className="line-clamp-2 text-sm font-medium hover:text-primary"
                    >
                      {item.name}
                    </Link>
                    {item.variant && <p className="text-xs text-muted-foreground">{item.variant}</p>}
                    <div className="mt-auto flex items-end justify-between gap-2 pt-1">
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(item.unitPrice, locale)} x{item.quantity}
                      </p>
                      <p className="text-sm font-semibold tabular-nums">{formatMoney(item.lineTotal, locale)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold">{dict.timeline}</h2>
            <ol className="relative flex flex-col gap-4 border-l-2 border-border pl-5">
              {/* What happens next (amber, in progress) above what already happened (green). */}
              {next && (
                <li className="relative">
                  <span aria-hidden className="absolute -left-[31px] top-0 flex size-5 items-center justify-center rounded-full bg-amber-400 text-white ring-4 ring-card">
                    <LoaderCircle className="size-3 animate-[spin_2s_linear_infinite]" strokeWidth={3} />
                  </span>
                  <p className="text-sm font-semibold text-amber-700">{next}</p>
                  {(order.status === "SHIPPED" || order.status === "DELIVERED") && order.autoConfirmAt && (
                    <p className="text-xs text-muted-foreground">{interpolate(dict.autoComplete, { date: formatDate(order.autoConfirmAt, locale) })}</p>
                  )}
                </li>
              )}
              {[...order.history].reverse().map((h) => (
                <li key={`${h.status}-${h.at}`} className="relative">
                  <span aria-hidden className="absolute -left-[31px] top-0 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-card">
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                  <p className="text-sm font-medium">
                    {h.status === "PENDING"
                      ? dict.timelinePlaced
                      : h.status === "CONFIRMED" && payment?.method === "COD"
                        ? dict.stepConfirmed
                        : dict.orderStatus[h.status]}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDate(h.at, locale, true)}</p>
                  {h.note && <p className="mt-0.5 text-xs text-muted-foreground">“{noteText(h.note, dict.timelineNotes)}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <aside className="flex flex-col gap-5">
          <Card className="px-4 py-4">
            <SectionTitle icon={MapPin}>{dict.shippingAddress}</SectionTitle>
            <p className="text-sm font-medium">{address.recipientName}</p>
            <p className="text-sm text-muted-foreground">{formatPhone(address.phone)}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {[address.line, address.village, address.district, provinceName(address.province, locale)].filter(Boolean).join(", ")}
            </p>
            {(order.deliveryProvider || order.trackingNumber || order.hasShippingBill || order.urgentDelivery || order.pickup) && (
              <dl className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                {order.pickup && (
                  <div className="space-y-1">
                    <p className="flex items-center gap-1.5 font-semibold text-primary">
                      <Store className="size-4" />
                      {dict.pickup}
                    </p>
                    {order.pickup.address && (
                      <div>
                        <dt className="text-muted-foreground">{dict.pickupAt}</dt>
                        <dd>{order.pickup.address}</dd>
                      </div>
                    )}
                    <Row label={dict.pickupCall} value={<a href={`tel:${order.pickup.phone}`} className="text-primary hover:underline">{formatPhone(order.pickup.phone)}</a>} />
                    {order.pickup.latitude !== null && order.pickup.longitude !== null && (
                      <a
                        href={`https://www.google.com/maps?q=${order.pickup.latitude},${order.pickup.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <MapPin className="size-3.5" />
                        {dict.openMap}
                      </a>
                    )}
                  </div>
                )}
                {order.urgentDelivery && (
                  <p className="flex items-center gap-1.5 font-semibold text-sale">
                    <Zap className="size-4" />
                    {dict.urgentDelivery}
                  </p>
                )}
                {order.deliveryProvider && (
                  <Row label={dict.carrier} value={order.deliveryProvider} />
                )}
                {order.trackingNumber && (
                  <Row label={dict.tracking} value={<span className="font-mono">{order.trackingNumber}</span>} />
                )}
                {order.hasShippingBill && (
                  <ShippingBill src={`/api/orders/${encodeURIComponent(order.number)}/shipping-bill`} label={dict.shippingBill} closeLabel={auth.close} />
                )}
              </dl>
            )}
          </Card>

          {order.payment && (
            <Card className="px-4 py-4">
              <SectionTitle icon={CreditCard}>{dict.paymentTitle}</SectionTitle>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{dict.paymentMethod[order.payment.method]}</p>
                {order.awaitingConfirmation ? (
                  <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">
                    {checkoutDict.verifying}
                  </span>
                ) : (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PAYMENT_TONE[order.payment.status]}`}>
                    {dict.paymentStatus[order.payment.status]}
                  </span>
                )}
              </div>
              {order.payment.paidAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {interpolate(dict.paidOn, { date: formatDate(order.payment.paidAt, locale, true) })}
                </p>
              )}
            </Card>
          )}

          {order.note && (
            <Card className="px-4 py-4">
              <SectionTitle icon={MessageSquareText}>{checkoutDict.noteTitle}</SectionTitle>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{order.note}</p>
            </Card>
          )}

          <Card className="px-4 py-4">
            <h2 className="mb-3 text-sm font-semibold">{dict.summary}</h2>
            <dl className="space-y-1.5 text-sm">
              <Row label={dict.subtotal} value={formatMoney(order.subtotal, locale)} />
              {/* Delivery is paid to the courier now; older orders may still carry a fee. */}
              {order.shippingFee > 0 && (
                <Row label={dict.shippingFee} value={formatMoney(order.shippingFee, locale)} />
              )}
              {order.discountTotal > 0 && (
                <Row label={dict.discount} value={<span className="text-sale">-{formatMoney(order.discountTotal, locale)}</span>} />
              )}
              {order.pointsUsed > 0 && (
                <p className="-mt-1 text-right text-xs text-muted-foreground">{interpolate(dict.pointsUsedNote, { n: order.pointsUsed.toLocaleString("en-US") })}</p>
              )}
            </dl>
            <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-border pt-3">
              <span className="text-sm font-semibold">{dict.total}</span>
              <span className="text-lg font-bold text-primary">{formatMoney(order.total, locale)}</span>
            </div>
          </Card>

          {first && (order.status === "COMPLETED" || order.status === "CANCELLED") && (
            <Link
              href={productPath(locale, order.shop.slug, first.productSlug)}
              className="flex h-11 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:brightness-110"
            >
              {dict.buyAgain}
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}

function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border ${className}`}>{children}</section>;
}

function SectionTitle({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
      <Icon className="size-4 text-primary" />
      {children}
    </h2>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}

const NOTICE_TONE = {
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  green: "bg-primary-soft text-primary ring-primary/20",
  grey: "bg-muted text-foreground/80 ring-border",
  orange: "bg-orange-50 text-orange-800 ring-orange-200",
} as const;

function Notice({
  tone,
  icon: Icon = CircleAlert,
  title,
  children,
}: {
  tone: keyof typeof NOTICE_TONE;
  icon?: typeof CircleAlert;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex gap-3 rounded-2xl px-4 py-3 text-sm ring-1 ring-inset ${NOTICE_TONE[tone]}`}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <p className={title ? "opacity-90" : ""}>{children}</p>}
      </div>
    </div>
  );
}

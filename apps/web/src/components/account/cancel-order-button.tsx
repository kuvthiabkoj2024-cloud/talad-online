"use client";

import { CircleX, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelOrder } from "@/lib/cart-actions";

/** Cancel an unpaid order (its payment was rejected): asks once, then cancels the whole checkout. */
export function CancelOrderButton({
  orderNumber,
  labels,
}: {
  orderNumber: string;
  labels: { cancelOrder: string; cancelOrderConfirm: string; cancelOrderYes: string; keepOrder: string; cancelOrderError: string };
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      setFailed(false);
      const res = await cancelOrder(orderNumber);
      if (res.ok) router.refresh();
      else setFailed(true);
    });

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="flex items-center justify-center gap-2 self-center rounded-full px-4 py-2 text-sm font-semibold text-sale transition-colors hover:bg-sale/10"
      >
        <CircleX className="size-4" />
        {labels.cancelOrder}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-sale/30">
      <p className="text-sm">{labels.cancelOrderConfirm}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="flex items-center gap-2 rounded-full bg-sale px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <CircleX className="size-4" />}
          {labels.cancelOrderYes}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setAsking(false)}
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          {labels.keepOrder}
        </button>
      </div>
      {failed && <p role="alert" className="text-sm text-sale">{labels.cancelOrderError}</p>}
    </div>
  );
}

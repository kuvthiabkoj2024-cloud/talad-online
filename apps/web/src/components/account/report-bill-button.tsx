"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reportShippingBill } from "@/lib/cart-actions";

/** Under the courier's bill: the customer tells the shop it's the wrong one, so it uploads a new one. */
export function ReportBillButton({
  orderNumber,
  labels,
}: {
  orderNumber: string;
  labels: { action: string; confirm: string; yes: string; error: string; cancel: string };
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      setFailed(false);
      const res = await reportShippingBill(orderNumber);
      if (res.ok) router.refresh();
      else setFailed(true);
    });

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="flex items-center gap-1.5 text-xs font-semibold text-sale hover:underline"
      >
        <TriangleAlert className="size-3.5" />
        {labels.action}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-xl p-3 ring-1 ring-border">
      <p className="text-xs">{labels.confirm}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {pending && <LoaderCircle className="size-3.5 animate-spin" />}
          {labels.yes}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setAsking(false)}
          className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          {labels.cancel}
        </button>
      </div>
      {failed && <p role="alert" className="text-xs text-sale">{labels.error}</p>}
    </div>
  );
}

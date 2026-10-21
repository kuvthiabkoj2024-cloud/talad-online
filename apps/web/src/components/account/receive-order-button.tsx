"use client";

import { LoaderCircle, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { receiveOrder } from "@/lib/cart-actions";

/** On a delivered order: the customer confirms they got it, completing the order now. */
export function ReceiveOrderButton({
  orderNumber,
  labels,
}: {
  orderNumber: string;
  labels: { receive: string; receiveConfirm: string; receiveYes: string; cancel: string; receiveError: string };
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      setFailed(false);
      const res = await receiveOrder(orderNumber);
      if (res.ok) router.refresh();
      else setFailed(true);
    });

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="flex items-center gap-2 self-start rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
      >
        <PackageCheck className="size-4" />
        {labels.receive}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-3 text-foreground ring-1 ring-border">
      <p className="text-sm">{labels.receiveConfirm}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={confirm}
          className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
          {labels.receiveYes}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setAsking(false)}
          className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          {labels.cancel}
        </button>
      </div>
      {failed && <p role="alert" className="text-sm text-sale">{labels.receiveError}</p>}
    </div>
  );
}

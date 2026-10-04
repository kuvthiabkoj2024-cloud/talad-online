"use client";

import { FlaskConical, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { simulatePayment } from "@/lib/cart-actions";

/**
 * Development only: records a payment for an unpaid order, standing in for the
 * BCEL One / LAPNet / U-Money callbacks until those gateways are integrated.
 */
export function SimulatePaymentButton({ orderNumber, label }: { orderNumber: string; label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (process.env.NODE_ENV === "production") return null;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await simulatePayment(orderNumber);
          router.refresh();
        })
      }
      className="flex items-center gap-1.5 self-start rounded-full border border-dashed border-amber-400 bg-amber-50 px-3.5 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-60"
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
      {label}
    </button>
  );
}

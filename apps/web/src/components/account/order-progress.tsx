import type { OrderStatus } from "@talad/shared";
import { Check, CircleCheckBig, ClipboardList, LoaderCircle, PackageCheck, Truck, type LucideIcon } from "lucide-react";

/** The order's journey: placed → paid (Taladonline checked it, or COD confirmed) → sent → completed. */
const STEPS: { status: OrderStatus; icon: LucideIcon }[] = [
  { status: "PENDING", icon: ClipboardList },
  { status: "CONFIRMED", icon: PackageCheck },
  { status: "SHIPPED", icon: Truck },
  { status: "COMPLETED", icon: CircleCheckBig },
];

/** Older in-between statuses sit on the step they belong to. */
const STEP_OF: Partial<Record<OrderStatus, OrderStatus>> = { PACKED: "CONFIRMED", DELIVERED: "SHIPPED", RETURN_REQUESTED: "SHIPPED" };

/**
 * Horizontal step tracker for the happy path: steps reached are a green check, the next one
 * (what's happening now) is amber with a turning progress icon. A return request stops at "Sent".
 */
export function OrderProgress({
  status,
  labels,
  waitingLabels,
}: {
  status: OrderStatus;
  labels: string[];
  /** Said instead while that step is the one in progress ("waiting to ship", not "shipped"). */
  waitingLabels: string[];
}) {
  const reached = STEPS.findIndex((s) => s.status === (STEP_OF[status] ?? status));

  return (
    <ol className="grid grid-cols-4">
      {STEPS.map(({ status: step, icon: Icon }, i) => {
        const done = i <= reached;
        const progressing = i === reached + 1 && status !== "RETURN_REQUESTED";
        return (
          <li key={step} className="relative flex flex-col items-center gap-1.5 text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${done ? "bg-primary" : progressing ? "bg-amber-400" : "bg-border"}`}
              />
            )}
            <span
              className={`relative z-10 flex size-8 items-center justify-center rounded-full ring-4 ring-card transition-colors ${
                done ? "bg-primary text-primary-foreground" : progressing ? "bg-amber-400 text-white" : "bg-muted text-muted-foreground/60"
              }`}
            >
              {done ? (
                <Check className="size-4" strokeWidth={3} />
              ) : progressing ? (
                <LoaderCircle className="size-4 animate-[spin_2s_linear_infinite]" strokeWidth={2.5} />
              ) : (
                <Icon className="size-4" />
              )}
            </span>
            <span
              className={`text-[11px] leading-tight sm:text-xs ${done ? "font-medium text-foreground" : progressing ? "font-semibold text-amber-700" : "text-muted-foreground"}`}
            >
              {progressing ? waitingLabels[i] : labels[i]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

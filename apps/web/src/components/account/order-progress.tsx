import type { OrderStatus } from "@talad/shared";
import { Check, CircleCheckBig, ClipboardList, Home, Package, PackageCheck, Truck, type LucideIcon } from "lucide-react";

const STEPS: { status: OrderStatus; icon: LucideIcon }[] = [
  { status: "PENDING", icon: ClipboardList },
  { status: "CONFIRMED", icon: PackageCheck },
  { status: "PACKED", icon: Package },
  { status: "SHIPPED", icon: Truck },
  { status: "DELIVERED", icon: Home },
  { status: "COMPLETED", icon: CircleCheckBig },
];

/** Horizontal step tracker for the happy path; a return request stops at "Delivered". */
export function OrderProgress({ status, labels }: { status: OrderStatus; labels: string[] }) {
  const current = STEPS.findIndex((s) => s.status === (status === "RETURN_REQUESTED" ? "DELIVERED" : status));

  return (
    <ol className="grid grid-cols-6">
      {STEPS.map(({ status: step, icon: Icon }, i) => {
        const done = i < current || (i === current && step === "COMPLETED");
        const active = i === current && !done;
        return (
          <li key={step} className="relative flex flex-col items-center gap-1.5 text-center">
            {i > 0 && (
              <span
                aria-hidden
                className={`absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 ${i <= current ? "bg-primary" : "bg-border"}`}
              />
            )}
            <span
              className={`relative z-10 flex size-8 items-center justify-center rounded-full ring-4 ring-card transition-colors ${
                done
                  ? "bg-primary text-primary-foreground"
                  : active
                    ? "bg-primary-soft text-primary ring-primary/20"
                    : "bg-muted text-muted-foreground/60"
              }`}
            >
              {done ? <Check className="size-4" strokeWidth={3} /> : <Icon className="size-4" />}
            </span>
            <span className={`text-[11px] leading-tight sm:text-xs ${i <= current ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {labels[i]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

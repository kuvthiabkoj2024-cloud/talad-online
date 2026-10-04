import type { OrderStatus } from "@talad/shared";
import { STATUS_TONE } from "@/lib/orders";

export function OrderStatusBadge({ status, label }: { status: OrderStatus; label: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_TONE[status]}`}>
      {label}
    </span>
  );
}

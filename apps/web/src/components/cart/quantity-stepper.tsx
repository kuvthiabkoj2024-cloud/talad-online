import { Minus, Plus } from "lucide-react";

/** − n + control for cart and checkout lines. */
export function QuantityStepper({
  value,
  max,
  labels,
  onChange,
}: {
  value: number;
  max: number;
  labels: { decrease: string; increase: string };
  onChange: (value: number) => void;
}) {
  const button =
    "flex size-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40";
  return (
    <div className="inline-flex h-8 items-center rounded-lg border border-border">
      <button type="button" aria-label={labels.decrease} disabled={value <= 1} onClick={() => onChange(value - 1)} className={button}>
        <Minus className="size-3.5" />
      </button>
      <span aria-live="polite" className="w-9 text-center text-sm tabular-nums">
        {value}
      </span>
      <button type="button" aria-label={labels.increase} disabled={value >= max} onClick={() => onChange(value + 1)} className={button}>
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
